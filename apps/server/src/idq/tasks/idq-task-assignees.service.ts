import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { LabelType } from '@docmost/db/repos/label/label.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { IdqKyselyDB } from '../database/idq-db.types';
import {
  ASSIGNEE_PREFIX,
  buildAssigneeIndex,
  humanizeLabelValue,
  isLabelValue,
  toLabelSlug,
} from './idq-task-fields';

export type AssigneeUser = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

export type TaskAssignee = {
  /** Value of the `ref-` label, e.g. "mario-rossi". */
  value: string;
  name: string;
  user: AssigneeUser | null;
};

export type AssigneeMappingRow = {
  value: string;
  /** User chosen by an admin. */
  user: AssigneeUser | null;
  /** User found by name or email, used when no one is chosen. */
  automatic: AssigneeUser | null;
};

export type WorkspaceMember = AssigneeUser & {
  /** `ref-` value to use for this member. */
  value: string;
};

/**
 * Who each `ref-` label stands for. An admin can link a value to a member
 * (needed when first names repeat, or the account has another name);
 * otherwise the value is matched by name or email (buildAssigneeIndex).
 */
@Injectable()
export class IdqTaskAssigneesService {
  constructor(
    @InjectKysely() private readonly db: IdqKyselyDB,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  /** Resolves `ref-` values to members, for the board and the panel. */
  async resolver(
    workspaceId: string,
  ): Promise<(value: string) => TaskAssignee> {
    const [members, explicit] = await Promise.all([
      this.workspaceUsers(workspaceId),
      this.explicitMap(workspaceId),
    ]);
    const byId = new Map(members.map((m) => [m.id, m]));
    const automatic = buildAssigneeIndex(members);

    return (value: string) => {
      const explicitId = explicit.get(value);
      const match =
        (explicitId ? byId.get(explicitId) : undefined) ??
        automatic.get(value) ??
        null;
      return {
        value,
        name: match?.name || humanizeLabelValue(value),
        user: match ? toAssigneeUser(match) : null,
      };
    };
  }

  /**
   * Members of the workspace, each with the `ref-` value that stands for
   * them: the value an admin linked to them, or their name as a label.
   */
  async members(workspaceId: string): Promise<WorkspaceMember[]> {
    const [members, explicit] = await Promise.all([
      this.workspaceUsers(workspaceId),
      this.explicitMap(workspaceId),
    ]);
    const valueByUser = new Map<string, string>();
    for (const [value, userId] of [...explicit].sort()) {
      if (!valueByUser.has(userId)) valueByUser.set(userId, value);
    }
    return members
      .map((m) => ({
        ...toAssigneeUser(m),
        value:
          valueByUser.get(m.id) ??
          (toLabelSlug(m.name ?? '') || toLabelSlug(m.email.split('@')[0])),
      }))
      .filter((m) => isLabelValue(m.value))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }

  /** Every `ref-` value in the workspace, with who it stands for. Admins only. */
  async listMappings(
    user: User,
    workspace: Workspace,
  ): Promise<AssigneeMappingRow[]> {
    this.assertAdmin(user, workspace);

    const [members, explicit, labels] = await Promise.all([
      this.workspaceUsers(workspace.id),
      this.explicitMap(workspace.id),
      this.db
        .selectFrom('labels')
        .select('name')
        .where('workspaceId', '=', workspace.id)
        .where('type', '=', LabelType.PAGE)
        .where('name', 'like', `${ASSIGNEE_PREFIX}%`)
        .execute(),
    ]);
    const byId = new Map(members.map((m) => [m.id, m]));
    const automatic = buildAssigneeIndex(members);

    const values = new Set<string>([
      ...labels
        .map((l) => l.name.slice(ASSIGNEE_PREFIX.length))
        .filter(Boolean),
      ...explicit.keys(),
    ]);

    return [...values].sort().map((value) => {
      const chosen = explicit.get(value);
      const auto = automatic.get(value);
      return {
        value,
        user:
          chosen && byId.has(chosen) ? toAssigneeUser(byId.get(chosen)) : null,
        automatic: auto ? toAssigneeUser(auto) : null,
      };
    });
  }

  /** Links a `ref-` value to a member, or removes the link. Admins only. */
  async setMapping(
    value: string,
    userId: string | null,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    this.assertAdmin(user, workspace);
    if (!isLabelValue(value)) {
      throw new BadRequestException('Invalid value');
    }

    if (!userId) {
      await this.db
        .deleteFrom('idqTaskAssignees')
        .where('workspaceId', '=', workspace.id)
        .where('value', '=', value)
        .execute();
      return;
    }

    const member = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', userId)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
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

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }

  private async explicitMap(workspaceId: string): Promise<Map<string, string>> {
    const rows = await this.db
      .selectFrom('idqTaskAssignees')
      .select(['value', 'userId'])
      .where('workspaceId', '=', workspaceId)
      .execute();
    return new Map(rows.map((r) => [r.value, r.userId]));
  }

  private workspaceUsers(workspaceId: string) {
    return this.db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'avatarUrl'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }
}

/** Never send emails to the client: only id, name and avatar. */
function toAssigneeUser(u: {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}): AssigneeUser {
  return { id: u.id, name: u.name, avatarUrl: u.avatarUrl };
}
