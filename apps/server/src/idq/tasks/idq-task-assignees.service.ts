import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { IdqKyselyDB } from '../database/idq-db.types';
import {
  buildAssigneeIndex,
  isLabelValue,
  nameFromLabelValue,
  toLabelSlug,
} from './idq-task-fields';

export type AssigneeUser = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

export type TaskAssignee = {
  /** Value of the person-in-charge label, e.g. "mario-rossi". */
  value: string;
  name: string;
  user: AssigneeUser | null;
};

export type AssigneeMappingRow = {
  value: string;
  /** Member chosen by an admin. */
  user: AssigneeUser | null;
  /** Member found by name or email, used when no one is chosen. */
  automatic: AssigneeUser | null;
};

export type WorkspaceMember = AssigneeUser & {
  /** Label value that stands for this member: it resolves back to them. */
  value: string;
};

type MemberRow = AssigneeUser & { email: string };

type Directory = {
  members: MemberRow[];
  /** Label value → member, chosen by an admin. */
  chosen: Map<string, string>;
  resolve: (value: string) => TaskAssignee;
};

/**
 * Who each person-in-charge label stands for. An admin can link a value to
 * a member (needed when first names repeat, or an account has another
 * name); otherwise the value is matched by name or email
 * (buildAssigneeIndex). Emails never leave this service.
 */
@Injectable()
export class IdqTaskAssigneesService {
  constructor(
    @InjectKysely() private readonly db: IdqKyselyDB,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  /** Resolves label values to members, for the board and the panel. */
  async resolver(workspaceId: string): Promise<Directory['resolve']> {
    return (await this.directory(workspaceId)).resolve;
  }

  /**
   * Members of the workspace with the label value that stands for each of
   * them: a value chosen by an admin, or else their full name, email or
   * first name, whichever resolves back to them. Members that no value
   * resolves to (e.g. two members with the same name and email prefix) are
   * left out until an admin links a value to them. Values are unique.
   */
  async members(workspaceId: string): Promise<WorkspaceMember[]> {
    const { members, chosen, resolve } = await this.directory(workspaceId);
    const chosenByUser = new Map<string, string[]>();
    for (const [value, userId] of [...chosen].sort()) {
      chosenByUser.set(userId, [...(chosenByUser.get(userId) ?? []), value]);
    }

    const result: WorkspaceMember[] = [];
    for (const member of members) {
      const fullName = toLabelSlug(member.name ?? '');
      const candidates = [
        ...(chosenByUser.get(member.id) ?? []),
        fullName,
        toLabelSlug(member.email.split('@')[0]),
        fullName.split('-')[0],
      ];
      const value = candidates.find(
        (candidate) =>
          isLabelValue(candidate) && resolve(candidate).user?.id === member.id,
      );
      if (value) result.push({ ...toAssigneeUser(member), value });
    }
    return result.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  /**
   * The given person-in-charge values (those the admin can see in use) and
   * the values already linked, with who they stand for. Admins only.
   */
  async listMappings(
    user: User,
    workspace: Workspace,
    usedValues: string[],
  ): Promise<AssigneeMappingRow[]> {
    this.assertAdmin(user, workspace);

    const { members, chosen } = await this.directory(workspace.id);
    const byId = new Map(members.map((m) => [m.id, m]));
    const automatic = buildAssigneeIndex(members);

    return [...new Set([...usedValues, ...chosen.keys()])]
      .sort()
      .map((value) => {
        const chosenUser = byId.get(chosen.get(value));
        const automaticUser = automatic.get(value);
        return {
          value,
          user: chosenUser ? toAssigneeUser(chosenUser) : null,
          automatic: automaticUser ? toAssigneeUser(automaticUser) : null,
        };
      });
  }

  /**
   * Links a label value to a member, or removes the link (userId null) to
   * go back to matching by name. Admins only.
   */
  async setMapping(
    value: string,
    userId: string | null,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    this.assertAdmin(user, workspace);

    if (!userId) {
      await this.db
        .deleteFrom('idqTaskAssignees')
        .where('workspaceId', '=', workspace.id)
        .where('value', '=', value)
        .execute();
      return;
    }

    const member = await this.activeUsers(workspace.id)
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!member) throw new NotFoundException('User not found');

    await this.db
      .insertInto('idqTaskAssignees')
      .values({
        workspaceId: workspace.id,
        value,
        userId,
        updatedById: user.id,
      })
      .onConflict((oc) =>
        oc.columns(['workspaceId', 'value']).doUpdateSet({
          userId,
          updatedById: user.id,
          updatedAt: sql`now()`,
        }),
      )
      .execute();
  }

  private async directory(workspaceId: string): Promise<Directory> {
    const [members, links] = await Promise.all([
      this.activeUsers(workspaceId).execute(),
      this.db
        .selectFrom('idqTaskAssignees')
        .select(['value', 'userId'])
        .where('workspaceId', '=', workspaceId)
        .execute(),
    ]);
    const byId = new Map(members.map((m) => [m.id, m]));
    const automatic = buildAssigneeIndex(members);
    // A link to a member who has left falls back to matching by name.
    const chosen = new Map(
      links.filter((l) => byId.has(l.userId)).map((l) => [l.value, l.userId]),
    );

    const resolve = (value: string): TaskAssignee => {
      const match = byId.get(chosen.get(value)) ?? automatic.get(value);
      return {
        value,
        name: match?.name || nameFromLabelValue(value),
        user: match ? toAssigneeUser(match) : null,
      };
    };
    return { members, chosen, resolve };
  }

  /** Members who can still log in. */
  private activeUsers(workspaceId: string) {
    return this.db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'avatarUrl'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null);
  }

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }
}

function toAssigneeUser(member: MemberRow): AssigneeUser {
  return { id: member.id, name: member.name, avatarUrl: member.avatarUrl };
}
