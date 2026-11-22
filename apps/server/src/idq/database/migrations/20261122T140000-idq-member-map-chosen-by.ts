import { type Kysely, sql } from 'kysely';

// Members map: remember who decided each row, and remember "Don't show me".
//
// Before, "Don't show me" deleted the row, so an admin could then put that
// member on the map, and "who decided" was deduced from set_by_id being null,
// so deleting the admin's user row (ON DELETE SET NULL) would have turned an
// admin's row into the member's own choice.
//
// Now chosen_by says who decided ('member' or 'admin'), and a member's
// "Don't show me" is a row with visibility 'hidden' and no province: the
// province is still not kept, but admins can no longer override the choice.
// set_by_id is only the admin who set the row, kept for display.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table idq_member_locations
      add column chosen_by varchar(10)
  `.execute(db);
  await sql`
    update idq_member_locations
    set chosen_by = case when set_by_id is null then 'member' else 'admin' end
  `.execute(db);
  await sql`
    alter table idq_member_locations
      alter column chosen_by set not null,
      alter column province_code drop not null,
      drop constraint idq_member_locations_visibility_check,
      add constraint idq_member_locations_visibility_check
        check (visibility in ('hidden', 'count', 'named')),
      add constraint idq_member_locations_chosen_by_check
        check (chosen_by in ('member', 'admin')),
      -- a province exactly when the member is on the map
      add constraint idq_member_locations_hidden_check
        check ((visibility = 'hidden') = (province_code is null)),
      -- only members remember "Don't show me"; an admin removing someone
      -- deletes the row
      add constraint idq_member_locations_admin_hidden_check
        check (chosen_by = 'member' or visibility <> 'hidden'),
      -- a member's own choice has no admin
      add constraint idq_member_locations_set_by_check
        check (chosen_by = 'admin' or set_by_id is null)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // The old schema can't hold "Don't show me", nor an admin's row without
  // its admin: those rows are dropped.
  await sql`
    delete from idq_member_locations
    where visibility = 'hidden' or (chosen_by = 'admin' and set_by_id is null)
  `.execute(db);
  await sql`
    alter table idq_member_locations
      drop constraint idq_member_locations_set_by_check,
      drop constraint idq_member_locations_admin_hidden_check,
      drop constraint idq_member_locations_hidden_check,
      drop constraint idq_member_locations_chosen_by_check,
      drop constraint idq_member_locations_visibility_check,
      add constraint idq_member_locations_visibility_check
        check (visibility in ('count', 'named')),
      alter column province_code set not null,
      drop column chosen_by
  `.execute(db);
}
