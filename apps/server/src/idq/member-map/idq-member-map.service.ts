import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { IdqKyselyDB, IdqMemberVisibility } from '../database/idq-db.types';
import {
  AdminMemberRow,
  AdminUpdate,
  AdminUpdateResult,
  MemberLocation,
  MemberMap,
  MemberVisibility,
  NOT_ON_MAP,
  summarizeMemberMap,
} from './idq-member-map';

const DELETED_USERS_SWEEP_MS = 60 * 60 * 1000;

/**
 * Where the members of a workspace live, by province (issue #4).
 *
 * Privacy by construction: the map reads counts per province with an
 * aggregate query, and identities only of the members who chose to show
 * their name, so who is counted without a name never leaves the database.
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
        .where('u.workspaceId', '=', workspaceId)
        .where('u.deletedAt', 'is', null)
        .where('u.deactivatedAt', 'is', null);

    const [counts, named] = await Promise.all([
      onMap()
        .select((eb) => [
          'l.provinceCode',
          eb.cast<number>(eb.fn.countAll(), 'integer').as('members'),
        ])
        .groupBy('l.provinceCode')
        .execute(),
      onMap()
        .where('l.visibility', '=', 'named')
        .select(['l.provinceCode', 'u.id', 'u.name', 'u.avatarUrl'])
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
        'l.setById',
        'setter.name as setByName',
      ])
      .where('l.userId', '=', userId)
      .where('l.workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!row) return { ...NOT_ON_MAP };
    return {
      provinceCode: row.provinceCode,
      visibility: row.visibility,
      setBy: row.setById ? { id: row.setById, name: row.setByName } : null,
    };
  }

  /**
   * The member's own choice. `hidden` deletes the row: the province of a
   * member who isn't on the map is not kept. Anything else becomes the
   * member's choice, which admins can no longer change.
   */
  async setLocation(
    userId: string,
    workspaceId: string,
    visibility: MemberVisibility,
    provinceCode: string | null,
  ): Promise<MemberLocation> {
    if (visibility === 'hidden' || !provinceCode) {
      await this.db
        .deleteFrom('idqMemberLocations')
        .where('userId', '=', userId)
        .where('workspaceId', '=', workspaceId)
        .execute();
      return { ...NOT_ON_MAP };
    }

    await this.db
      .insertInto('idqMemberLocations')
      .values({ userId, workspaceId, provinceCode, visibility, setById: null })
      .onConflict((oc) =>
        oc.column('userId').doUpdateSet({
          provinceCode,
          visibility,
          setById: null,
          updatedAt: new Date(),
        }),
      )
      .execute();
    return { provinceCode, visibility, setBy: null };
  }

  /**
   * Every active member of the workspace, with where an admin put them on
   * the map. For members who chose themselves, only that they chose: their
   * province and visibility aren't shown to admins (see AdminMemberRow).
   */
  async listForAdmin(workspaceId: string): Promise<AdminMemberRow[]> {
    const rows = await this.db
      .selectFrom('users as u')
      .leftJoin('idqMemberLocations as l', (join) =>
        join
          .onRef('l.userId', '=', 'u.id')
          .on('l.workspaceId', '=', workspaceId),
      )
      .leftJoin('users as setter', 'setter.id', 'l.setById')
      .select([
        'u.id',
        'u.name',
        'u.email',
        'u.avatarUrl',
        'l.provinceCode',
        'l.visibility',
        'l.userId as locationUserId',
        'l.setById',
        'setter.name as setByName',
        'l.updatedAt',
      ])
      .where('u.workspaceId', '=', workspaceId)
      .where('u.deletedAt', 'is', null)
      .where('u.deactivatedAt', 'is', null)
      .orderBy('u.name')
      .orderBy('u.email')
      .execute();

    return rows.map((row) => {
      const member = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatarUrl: row.avatarUrl,
      };
      if (row.locationUserId === null) {
        return {
          ...member,
          provinceCode: null,
          visibility: 'hidden',
          chosenBy: null,
          setByName: null,
          updatedAt: null,
        };
      }
      if (!row.setById) {
        return {
          ...member,
          provinceCode: null,
          visibility: null,
          chosenBy: 'member',
          setByName: null,
          updatedAt: null,
        };
      }
      return {
        ...member,
        provinceCode: row.provinceCode,
        visibility: row.visibility,
        chosenBy: 'admin',
        setByName: row.setByName,
        updatedAt: row.updatedAt as unknown as Date,
      };
    });
  }

  /**
   * An admin puts members on the map, changes or removes them. Never what a
   * member chose in their profile: those are skipped, and the write itself
   * checks it, so a member who chooses in the meantime keeps their choice.
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
        // An admin setting their own province makes their own choice.
        const own = userId === admin.id;
        const existing = await trx
          .selectFrom('idqMemberLocations')
          .select('setById')
          .where('userId', '=', userId)
          .forUpdate()
          .executeTakeFirst();
        if (existing && existing.setById === null && !own) {
          result.skipped.push({ userId, reason: 'chosen-by-member' });
          continue;
        }

        if (update.visibility === 'hidden' || !update.provinceCode) {
          if (existing) {
            await trx
              .deleteFrom('idqMemberLocations')
              .where('userId', '=', userId)
              .execute();
            result.updated++;
          }
          continue;
        }

        const values = {
          provinceCode: update.provinceCode,
          visibility: update.visibility as IdqMemberVisibility,
          setById: own ? null : admin.id,
        };
        const written = await trx
          .insertInto('idqMemberLocations')
          .values({ userId, workspaceId, ...values })
          .onConflict((oc) => {
            const set = oc
              .column('userId')
              .doUpdateSet({ ...values, updatedAt: new Date() });
            // If the member chose in the meantime, their choice stays.
            return own
              ? set
              : set.where('idqMemberLocations.setById', 'is not', null);
          })
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
   * Erases the province of deleted users. The map already leaves them out;
   * this removes the data too, without changing Docmost's code. Deactivated
   * users keep theirs, and come back on the map if they are reactivated.
   */
  @Interval('idq-member-map-deleted-users', DELETED_USERS_SWEEP_MS)
  async deleteLocationsOfDeletedUsers(): Promise<void> {
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
    } catch (err) {
      this.logger.error(
        `Failed to delete the provinces of deleted users: ${(err as Error).message}`,
      );
    }
  }
}
