import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { Transaction } from 'kysely';
import {
  IdqDbInterface,
  IdqKyselyDB,
  IdqMemberVisibility,
} from '../database/idq-db.types';
import {
  AdminMemberRow,
  AdminUpdate,
  AdminUpdateResult,
  MemberLocation,
  MemberMap,
  MemberVisibility,
  NOT_DECIDED,
  summarizeMemberMap,
} from './idq-member-map';

const DELETED_USERS_SWEEP_MS = 60 * 60 * 1000;

type Db = IdqKyselyDB | Transaction<IdqDbInterface>;

/**
 * Where the members of a workspace live, by province (issue #4).
 *
 * Privacy by construction: the map reads counts per province with an
 * aggregate query, and identities only of the members who chose to show
 * their name, so who is counted without a name never leaves the database.
 *
 * Every row says who decided it (chosen_by). What a member decides in their
 * profile, "Don't show me" included, can't be changed by admins, and admins
 * only learn that the member decided, never which choice. The counts on the
 * map are still visible to everyone: a province with one or two members can
 * point to a person (see .github/MEMBER-MAP.md).
 */
@Injectable()
export class IdqMemberMapService {
  private readonly logger = new Logger('IdqMemberMapService');

  constructor(@InjectKysely() private readonly db: IdqKyselyDB) {}

  async getMap(workspaceId: string): Promise<MemberMap> {
    const onMap = () =>
      this.db
        .selectFrom('idqMemberLocations as l')
        .innerJoin('users as u', 'u.id', 'l.userId')
        .where('l.workspaceId', '=', workspaceId)
        .where('l.visibility', 'in', ['count', 'named'])
        .where('l.provinceCode', 'is not', null)
        .where('u.workspaceId', '=', workspaceId)
        .where('u.deletedAt', 'is', null)
        .where('u.deactivatedAt', 'is', null);

    const [counts, named] = await Promise.all([
      onMap()
        .select((eb) => [
          eb.ref('l.provinceCode').$notNull().as('provinceCode'),
          eb.cast<number>(eb.fn.countAll(), 'integer').as('members'),
        ])
        .groupBy('l.provinceCode')
        .execute(),
      onMap()
        .where('l.visibility', '=', 'named')
        .select((eb) => [
          eb.ref('l.provinceCode').$notNull().as('provinceCode'),
          'u.id',
          'u.name',
          'u.avatarUrl',
        ])
        .orderBy('u.name')
        .orderBy('u.id')
        .execute(),
    ]);

    return summarizeMemberMap(counts, named);
  }

  async getLocation(
    userId: string,
    workspaceId: string,
  ): Promise<MemberLocation> {
    const row = await this.db
      .selectFrom('idqMemberLocations as l')
      .leftJoin('users as setter', 'setter.id', 'l.setById')
      .select([
        'l.provinceCode',
        'l.visibility',
        'l.chosenBy',
        'l.setById',
        'setter.name as setByName',
      ])
      .where('l.userId', '=', userId)
      .where('l.workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!row) return { ...NOT_DECIDED };
    return {
      provinceCode: row.provinceCode,
      visibility: row.visibility,
      chosenBy: row.chosenBy,
      setBy:
        row.chosenBy === 'admin' && row.setById
          ? { id: row.setById, name: row.setByName }
          : null,
    };
  }

  /**
   * The member's own choice, which admins can no longer change. `hidden`
   * keeps only the choice, not the province: the province of a member who
   * isn't on the map is never stored.
   */
  async setLocation(
    userId: string,
    workspaceId: string,
    visibility: MemberVisibility,
    provinceCode: string | null,
  ): Promise<MemberLocation> {
    const choice = await this.writeOwnChoice(
      this.db,
      userId,
      workspaceId,
      visibility,
      provinceCode,
    );
    return { ...choice, chosenBy: 'member', setBy: null };
  }

  private async writeOwnChoice(
    db: Db,
    userId: string,
    workspaceId: string,
    visibility: MemberVisibility,
    provinceCode: string | null,
  ): Promise<{ provinceCode: string | null; visibility: MemberVisibility }> {
    const hidden = visibility === 'hidden' || !provinceCode;
    const values = {
      provinceCode: hidden ? null : provinceCode,
      visibility: (hidden ? 'hidden' : visibility) as IdqMemberVisibility,
      chosenBy: 'member' as const,
      setById: null,
    };
    await db
      .insertInto('idqMemberLocations')
      .values({ userId, workspaceId, ...values })
      .onConflict((oc) =>
        oc.column('userId').doUpdateSet({ ...values, updatedAt: new Date() }),
      )
      .execute();
    return { provinceCode: values.provinceCode, visibility: values.visibility };
  }

  /**
   * Every active member of the workspace, with where an admin put them on
   * the map. For members who decided themselves, only that they decided:
   * which choice (even whether they are on the map) isn't shown to admins,
   * except for the admin's own row (see AdminMemberRow).
   */
  async listForAdmin(
    admin: { id: string },
    workspaceId: string,
  ): Promise<AdminMemberRow[]> {
    const rows = await this.db
      .selectFrom('users as u')
      .leftJoin('idqMemberLocations as l', (join) =>
        join
          .onRef('l.userId', '=', 'u.id')
          .on('l.workspaceId', '=', workspaceId),
      )
      .leftJoin('users as setter', 'setter.id', 'l.setById')
      .select((eb) => [
        'u.id',
        'u.name',
        'u.email',
        'u.avatarUrl',
        'l.provinceCode',
        'l.visibility',
        'l.chosenBy',
        'setter.name as setByName',
        // Through this left join Kysely leaves the column typed as the
        // Timestamp column type, not its select type: state what it is.
        eb.ref('l.updatedAt').$castTo<Date | null>().as('updatedAt'),
      ])
      .where('u.workspaceId', '=', workspaceId)
      .where('u.deletedAt', 'is', null)
      .where('u.deactivatedAt', 'is', null)
      .orderBy('u.name')
      .orderBy('u.email')
      .execute();

    return rows.map((row): AdminMemberRow => {
      const member = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatarUrl: row.avatarUrl,
      };
      const own = row.id === admin.id;
      if (row.chosenBy === null) {
        return {
          ...member,
          provinceCode: null,
          visibility: 'hidden',
          chosenBy: null,
          editable: true,
          setByName: null,
          updatedAt: null,
        };
      }
      if (row.chosenBy === 'member' && !own) {
        // The same for every choice: admins must not learn which one.
        return {
          ...member,
          provinceCode: null,
          visibility: null,
          chosenBy: 'member',
          editable: false,
          setByName: null,
          updatedAt: null,
        };
      }
      return {
        ...member,
        provinceCode: row.provinceCode,
        visibility: row.visibility,
        chosenBy: row.chosenBy,
        editable: true,
        setByName: row.chosenBy === 'admin' ? row.setByName : null,
        updatedAt: row.updatedAt,
      };
    });
  }

  /**
   * An admin puts members on the map, changes or removes them. Never what a
   * member decided in their profile: those are skipped, and the write itself
   * checks it, so a member who decides in the meantime keeps their choice.
   * An admin's own row is their own choice, as if made in the profile.
   */
  async updateAsAdmin(
    admin: { id: string },
    workspaceId: string,
    updates: readonly AdminUpdate[],
  ): Promise<AdminUpdateResult> {
    const result: AdminUpdateResult = { updated: 0, skipped: [] };
    const userIds = [...new Set(updates.map((u) => u.userId))];
    if (userIds.length === 0) return result;

    const members = new Set(
      (
        await this.db
          .selectFrom('users')
          .select('id')
          .where('id', 'in', userIds)
          .where('workspaceId', '=', workspaceId)
          .where('deletedAt', 'is', null)
          .where('deactivatedAt', 'is', null)
          .execute()
      ).map((u) => u.id),
    );

    await this.db.transaction().execute(async (trx) => {
      for (const update of updates) {
        const { userId } = update;
        if (!members.has(userId)) {
          result.skipped.push({ userId, reason: 'not-a-member' });
          continue;
        }

        if (userId === admin.id) {
          await this.writeOwnChoice(
            trx,
            userId,
            workspaceId,
            update.visibility,
            update.provinceCode ?? null,
          );
          result.updated++;
          continue;
        }

        const existing = await trx
          .selectFrom('idqMemberLocations')
          .select('chosenBy')
          .where('userId', '=', userId)
          .forUpdate()
          .executeTakeFirst();
        if (existing?.chosenBy === 'member') {
          result.skipped.push({ userId, reason: 'chosen-by-member' });
          continue;
        }

        if (update.visibility === 'hidden' || !update.provinceCode) {
          // Removing what an admin set: back to "nobody decided".
          if (existing) {
            await trx
              .deleteFrom('idqMemberLocations')
              .where('userId', '=', userId)
              .where('chosenBy', '=', 'admin')
              .execute();
            result.updated++;
          }
          continue;
        }

        const values = {
          provinceCode: update.provinceCode,
          visibility: update.visibility as IdqMemberVisibility,
          chosenBy: 'admin' as const,
          setById: admin.id,
        };
        const written = await trx
          .insertInto('idqMemberLocations')
          .values({ userId, workspaceId, ...values })
          .onConflict((oc) =>
            oc
              .column('userId')
              .doUpdateSet({ ...values, updatedAt: new Date() })
              // If the member decided in the meantime, their choice stays.
              .where('idqMemberLocations.chosenBy', '=', 'admin'),
          )
          .executeTakeFirst();
        if (Number(written.numInsertedOrUpdatedRows ?? 0) > 0) {
          result.updated++;
        } else {
          result.skipped.push({ userId, reason: 'chosen-by-member' });
        }
      }
    });
    return result;
  }

  /**
   * Erases the rows of deleted users, choices included. The map already
   * leaves them out; this removes the data too, without changing Docmost's
   * code. Deactivated users keep theirs, and come back on the map if they
   * are reactivated.
   */
  @Interval('idq-member-map-deleted-users', DELETED_USERS_SWEEP_MS)
  async deleteLocationsOfDeletedUsers(): Promise<number> {
    try {
      const result = await this.db
        .deleteFrom('idqMemberLocations')
        .where('userId', 'in', (eb) =>
          eb
            .selectFrom('users')
            .select('users.id')
            .where('users.deletedAt', 'is not', null),
        )
        .executeTakeFirst();
      const deleted = Number(result.numDeletedRows ?? 0);
      if (deleted > 0) {
        this.logger.log(`Deleted the province of ${deleted} deleted user(s)`);
      }
      return deleted;
    } catch (err) {
      this.logger.error(
        `Failed to delete the provinces of deleted users: ${(err as Error).message}`,
      );
      return 0;
    }
  }
}
