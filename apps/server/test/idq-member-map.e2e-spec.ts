/**
 * End-to-end test of the members map (issue #4), against a running instance.
 *
 * It needs a new database (the test sets up the workspace):
 *   IDQ_E2E_URL=http://localhost:3300 \
 *   IDQ_E2E_DATABASE_URL=postgresql://docmost:docmost@localhost:55432/docmost \
 *   npx jest --config test/jest-e2e.json --runInBand idq-member-map
 *
 * Without IDQ_E2E_URL the test is skipped.
 */
import * as postgres from 'postgres';
import { CamelCasePlugin, Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { IdqMemberMapService } from '../src/idq/member-map/idq-member-map.service';

const BASE = process.env.IDQ_E2E_URL;
const DB_URL = process.env.IDQ_E2E_DATABASE_URL;
const describeE2E = BASE && DB_URL ? describe : describe.skip;

const PASSWORD = 'idq-e2e-password-123';
// Nobody decided: not on the map, and admins may still set it
const NOT_DECIDED = {
  provinceCode: null,
  visibility: 'hidden',
  chosenBy: null,
  setBy: null,
};
// The member chose "Don't show me": remembered, without the province
const HIDDEN_BY_MEMBER = { ...NOT_DECIDED, chosenBy: 'member' };
const HIDDEN_ROW = { province_code: null, visibility: 'hidden' };

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timeout');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

type Session = { cookie?: string; bearer?: string };
type Member = { session: Session; id: string; name: string; email: string };

async function api(session: Session | null, path: string, body: object = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(session?.cookie ? { cookie: session.cookie } : {}),
      ...(session?.bearer ? { authorization: `Bearer ${session.bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: res.status, data: json?.data, text, res };
}

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const auth = raw.find((c) => c.startsWith('authToken='));
  if (!auth) throw new Error('No authToken cookie');
  return auth.split(';')[0];
}

async function login(email: string): Promise<Session> {
  const { res, status } = await api(null, '/auth/login', {
    email,
    password: PASSWORD,
  });
  if (status !== 200) throw new Error(`login ${email}: ${status}`);
  return { cookie: cookieFrom(res) };
}

describeE2E('IDQ members map (e2e)', () => {
  let sql: postgres.Sql;
  let admin: Session;
  // Ada: named in BO. Bruno: counted in BO. Carla: counted in FC.
  // Dario: named in RM, deactivated later. Elena: not on the map.
  let ada: Member;
  let bruno: Member;
  let carla: Member;
  let dario: Member;
  let elena: Member;

  async function invite(email: string, name: string): Promise<Member> {
    await api(admin, '/workspace/invites/create', {
      emails: [email],
      role: 'member',
    });
    const [row] = await sql`
      select id, token from workspace_invitations where email = ${email}`;
    const accepted = await api(null, '/workspace/invites/accept', {
      invitationId: row.id,
      token: row.token,
      name,
      password: PASSWORD,
    });
    expect(accepted.status).toBe(200);
    const session = await login(email);
    const id = (await api(session, '/users/me')).data.user.id as string;
    return { session, id, name, email };
  }

  async function setLocation(
    member: Member,
    visibility: string,
    provinceCode?: string | null,
  ) {
    return api(member.session, '/idq/member-map/me/update', {
      visibility,
      provinceCode,
    });
  }

  async function map(session: Session = admin) {
    const res = await api(session, '/idq/member-map');
    expect(res.status).toBe(200);
    return res;
  }

  async function storedRow(member: Member) {
    const rows = await sql`
      select province_code, visibility from idq_member_locations
      where user_id = ${member.id}`;
    return rows[0] ?? null;
  }

  async function storedChosenBy(member: Member) {
    const [row] = await sql`
      select chosen_by, set_by_id from idq_member_locations
      where user_id = ${member.id}`;
    return row ?? null;
  }

  beforeAll(async () => {
    sql = postgres(DB_URL!, { max: 3, onnotice: () => {} });

    const setup = await api(null, '/auth/setup', {
      workspaceName: 'IDQ member map test',
      name: 'Admin',
      email: 'admin@idq.test',
      password: PASSWORD,
    });
    if (setup.status !== 200 && setup.status !== 201) {
      throw new Error(
        `Setup failed (${setup.status}): the e2e test needs an empty database`,
      );
    }
    admin = await login('admin@idq.test');

    ada = await invite('ada.lovelace@idq.test', 'Ada Lovelace');
    bruno = await invite('bruno.anonimo@idq.test', 'Bruno Anonimo');
    carla = await invite('carla.anonima@idq.test', 'Carla Anonima');
    dario = await invite('dario.rossi@idq.test', 'Dario Rossi');
    elena = await invite('elena.nascosta@idq.test', 'Elena Nascosta');
  }, 60000);

  afterAll(async () => {
    await sql?.end();
  });

  describe('access', () => {
    it.each(['/idq/member-map', '/idq/member-map/me'])(
      'refuses %s without login',
      async (path) => {
        expect((await api(null, path)).status).toBe(401);
      },
    );

    it('refuses changes without login', async () => {
      const res = await api(null, '/idq/member-map/me/update', {
        visibility: 'named',
        provinceCode: 'BO',
      });
      expect(res.status).toBe(401);
    });

    it('refuses an IDQ API key: only interactive sessions', async () => {
      const created = await api(ada.session, '/idq/api-keys/create', {
        name: 'map test',
      });
      expect(created.status).toBe(200);
      const key = { bearer: created.data.key as string };
      expect((await api(key, '/idq/member-map')).status).toBe(401);
      expect((await api(key, '/idq/member-map/me')).status).toBe(401);
    });
  });

  describe('own province', () => {
    it('is not set for a new member: nobody is on the map by default', async () => {
      const me = await api(elena.session, '/idq/member-map/me');
      expect(me.status).toBe(200);
      expect(me.data).toEqual(NOT_DECIDED);
      expect((await map()).data.totals).toEqual({
        members: 0,
        provinces: 0,
        regions: 0,
      });
    });

    it('can be set, changed and removed', async () => {
      const set = await setLocation(ada, 'named', 'bo');
      expect(set.status).toBe(200);
      expect(set.data).toEqual({
        provinceCode: 'BO',
        visibility: 'named',
        chosenBy: 'member',
        setBy: null,
      });
      expect((await api(ada.session, '/idq/member-map/me')).data).toEqual({
        provinceCode: 'BO',
        visibility: 'named',
        chosenBy: 'member',
        setBy: null,
      });

      const changed = await setLocation(ada, 'count', 'FC');
      expect(changed.data).toEqual({
        provinceCode: 'FC',
        visibility: 'count',
        chosenBy: 'member',
        setBy: null,
      });
      expect(await storedRow(ada)).toEqual({
        province_code: 'FC',
        visibility: 'count',
      });

      // Leaving the map forgets the province, but remembers the choice
      const removed = await setLocation(ada, 'hidden', 'FC');
      expect(removed.data).toEqual(HIDDEN_BY_MEMBER);
      expect(await storedRow(ada)).toEqual(HIDDEN_ROW);
      expect((await api(ada.session, '/idq/member-map/me')).data).toEqual(
        HIDDEN_BY_MEMBER,
      );
      expect((await map()).data.totals.members).toBe(0);
    });

    it('needs a valid province and visibility', async () => {
      expect((await setLocation(ada, 'named')).status).toBe(400);
      expect((await setLocation(ada, 'named', null)).status).toBe(400);
      expect((await setLocation(ada, 'count', 'XX')).status).toBe(400);
      expect((await setLocation(ada, 'count', 'Bologna')).status).toBe(400);
      expect((await setLocation(ada, 'public', 'BO')).status).toBe(400);
      expect(await storedRow(ada)).toEqual(HIDDEN_ROW);
    });

    it("is only the user's own", async () => {
      await setLocation(bruno, 'count', 'BO');
      // An id in the body is ignored: /me is always the logged-in user
      const me = await api(elena.session, '/idq/member-map/me', {
        userId: bruno.id,
      });
      expect(me.data).toEqual(NOT_DECIDED);
      await api(elena.session, '/idq/member-map/me/update', {
        userId: bruno.id,
        visibility: 'hidden',
      });
      expect(await storedRow(bruno)).toEqual({
        province_code: 'BO',
        visibility: 'count',
      });
    });
  });

  describe('map', () => {
    beforeAll(async () => {
      await setLocation(ada, 'named', 'BO');
      await setLocation(bruno, 'count', 'BO');
      await setLocation(carla, 'count', 'FC');
      await setLocation(dario, 'named', 'RM');
      await setLocation(elena, 'hidden');
    });

    it('counts members by province, region and in total', async () => {
      const { data } = await map(elena.session);
      expect(data.totals).toEqual({ members: 4, provinces: 3, regions: 2 });
      expect(
        data.provinces.map((p: { code: string; members: number }) => [
          p.code,
          p.members,
        ]),
      ).toEqual([
        ['BO', 2],
        ['FC', 1],
        ['RM', 1],
      ]);
    });

    it('shows the names only of who chose to show them', async () => {
      const { data, text } = await map(carla.session);
      const byCode = Object.fromEntries(
        data.provinces.map((p: { code: string }) => [p.code, p]),
      );
      expect(byCode.BO.named).toEqual([
        { id: ada.id, name: 'Ada Lovelace', avatarUrl: null },
      ]);
      expect(byCode.FC.named).toEqual([]);
      expect(byCode.RM.named).toEqual([
        { id: dario.id, name: 'Dario Rossi', avatarUrl: null },
      ]);

      // Nothing about who is only counted, or not on the map
      for (const hidden of [bruno, carla, elena]) {
        expect(text).not.toContain(hidden.id);
        expect(text).not.toContain(hidden.name);
      }
      // No e-mail addresses, of anyone
      expect(text).not.toContain('@idq.test');
    });

    it('leaves out deactivated and deleted members', async () => {
      const deactivated = await api(admin, '/workspace/members/deactivate', {
        userId: dario.id,
      });
      expect(deactivated.status).toBe(200);

      await setLocation(elena, 'named', 'RM');
      const deleted = await api(admin, '/workspace/members/delete', {
        userId: elena.id,
      });
      expect(deleted.status).toBe(200);

      const { data, text } = await map(ada.session);
      expect(data.totals).toEqual({ members: 3, provinces: 2, regions: 1 });
      expect(text).not.toContain('RM');
      expect(text).not.toContain(dario.id);
      expect(text).not.toContain(elena.id);
    });

    it('erases the rows of deleted users in the hourly sweep', async () => {
      // Docmost only soft-deletes users: the row is still there
      expect(await storedRow(elena)).toEqual({
        province_code: 'RM',
        visibility: 'named',
      });
      // The sweep runs hourly (@Interval): run it directly, on this database
      const db = new Kysely<any>({
        dialect: new PostgresJSDialect({
          postgres: postgres(DB_URL!, { max: 1, onnotice: () => {} }),
        }),
        plugins: [new CamelCasePlugin()],
      });
      try {
        const service = new IdqMemberMapService(db);
        expect(await service.deleteLocationsOfDeletedUsers()).toBe(1);
        expect(await service.deleteLocationsOfDeletedUsers()).toBe(0);
      } finally {
        await db.destroy();
      }
      expect(await storedRow(elena)).toBeNull();
      // Deactivated users keep theirs, and everyone else too
      expect(await storedRow(dario)).toEqual({
        province_code: 'RM',
        visibility: 'named',
      });
      expect((await map(ada.session)).data.totals.members).toBe(3);
    });
  });

  describe('admin management', () => {
    let adminId: string;
    let fabio: Member;
    let gina: Member;
    // Hana chooses "Don't show me"; Ivo decides while an admin is saving
    let hana: Member;
    let ivo: Member;

    async function adminUpdate(session: Session, members: object[]) {
      return api(session, '/idq/member-map/admin/update', { members });
    }

    async function adminList() {
      const { status, data } = await api(
        admin,
        '/idq/member-map/admin/members',
      );
      expect(status).toBe(200);
      return Object.fromEntries(data.map((m: { id: string }) => [m.id, m]));
    }

    beforeAll(async () => {
      adminId = (await api(admin, '/users/me')).data.user.id;
      fabio = await invite('fabio.consenso@idq.test', 'Fabio Consenso');
      gina = await invite('gina.consenso@idq.test', 'Gina Consenso');
      hana = await invite('hana.riservata@idq.test', 'Hana Riservata');
      ivo = await invite('ivo.ritardo@idq.test', 'Ivo Ritardo');
      await setLocation(hana, 'hidden');
    }, 30000);

    it('is for admins only', async () => {
      expect(
        (await api(ada.session, '/idq/member-map/admin/members')).status,
      ).toBe(403);
      const update = await adminUpdate(ada.session, [
        { userId: fabio.id, visibility: 'named', provinceCode: 'RM' },
      ]);
      expect(update.status).toBe(403);
      expect(await storedRow(fabio)).toBeNull();
      expect((await api(null, '/idq/member-map/admin/members')).status).toBe(
        401,
      );
    });

    it('lists the active members, with who set their province', async () => {
      const byId = await adminList();
      // What members chose themselves isn't shown, not even to admins: named
      // (Ada), counted (Bruno) and "Don't show me" (Hana) look the same
      for (const member of [ada, bruno, hana]) {
        expect(byId[member.id]).toEqual({
          id: member.id,
          name: member.name,
          email: member.email,
          avatarUrl: null,
          provinceCode: null,
          visibility: null,
          chosenBy: 'member',
          editable: false,
          setByName: null,
          updatedAt: null,
        });
      }
      expect(byId[fabio.id]).toMatchObject({
        provinceCode: null,
        visibility: 'hidden',
        chosenBy: null,
        editable: true,
      });
      // Deactivated and deleted users aren't listed
      expect(byId[dario.id]).toBeUndefined();
      expect(byId[elena.id]).toBeUndefined();
    });

    it('puts members on the map, and they see who did it', async () => {
      const { status, data } = await adminUpdate(admin, [
        { userId: fabio.id, visibility: 'named', provinceCode: 'rm' },
        { userId: gina.id, visibility: 'count', provinceCode: 'NA' },
      ]);
      expect(status).toBe(200);
      expect(data).toEqual({ updated: 2, skipped: [] });

      expect((await api(fabio.session, '/idq/member-map/me')).data).toEqual({
        provinceCode: 'RM',
        visibility: 'named',
        chosenBy: 'admin',
        setBy: { id: adminId, name: 'Admin' },
      });
      const [row] = await sql`
        select set_by_id from idq_member_locations where user_id = ${fabio.id}`;
      expect(row.set_by_id).toBe(adminId);
      const listed = (await api(admin, '/idq/member-map/admin/members')).data;
      expect(
        listed.find((m: { id: string }) => m.id === gina.id),
      ).toMatchObject({
        provinceCode: 'NA',
        visibility: 'count',
        chosenBy: 'admin',
        setByName: 'Admin',
      });

      const rome = (await map(ada.session)).data.provinces.find(
        (p: { code: string }) => p.code === 'RM',
      );
      expect(rome.named).toEqual([
        { id: fabio.id, name: 'Fabio Consenso', avatarUrl: null },
      ]);
    });

    it('never changes what members chose themselves', async () => {
      const { data } = await adminUpdate(admin, [
        { userId: ada.id, visibility: 'hidden' },
        { userId: bruno.id, visibility: 'named', provinceCode: 'RM' },
      ]);
      expect(data).toEqual({
        updated: 0,
        skipped: [
          { userId: ada.id, reason: 'chosen-by-member' },
          { userId: bruno.id, reason: 'chosen-by-member' },
        ],
      });
      expect(await storedRow(ada)).toEqual({
        province_code: 'BO',
        visibility: 'named',
      });
      expect(await storedRow(bruno)).toEqual({
        province_code: 'BO',
        visibility: 'count',
      });
    });

    it('never puts on the map a member who chose "Don\'t show me"', async () => {
      const { data } = await adminUpdate(admin, [
        { userId: hana.id, visibility: 'named', provinceCode: 'TO' },
      ]);
      expect(data).toEqual({
        updated: 0,
        skipped: [{ userId: hana.id, reason: 'chosen-by-member' }],
      });
      expect(await storedRow(hana)).toEqual(HIDDEN_ROW);
      expect((await api(hana.session, '/idq/member-map/me')).data).toEqual(
        HIDDEN_BY_MEMBER,
      );
      const { data: mapData, text } = await map(ada.session);
      expect(mapData.provinces.map((p: { code: string }) => p.code)).toEqual([
        'BO',
        'FC',
        'NA',
        'RM',
      ]);
      expect(text).not.toContain(hana.id);
    });

    it("keeps an admin's row the admin's, even without its admin", async () => {
      // What ON DELETE SET NULL would do if the admin's user row were deleted
      await sql`
        update idq_member_locations set set_by_id = null
        where user_id = ${gina.id}`;
      expect((await api(gina.session, '/idq/member-map/me')).data).toEqual({
        provinceCode: 'NA',
        visibility: 'count',
        chosenBy: 'admin',
        setBy: null,
      });
      expect((await adminList())[gina.id]).toMatchObject({
        provinceCode: 'NA',
        chosenBy: 'admin',
        editable: true,
        setByName: null,
      });
      // ...so admins can still change it
      const { data } = await adminUpdate(admin, [
        { userId: gina.id, visibility: 'count', provinceCode: 'NA' },
      ]);
      expect(data).toEqual({ updated: 1, skipped: [] });
      expect(await storedChosenBy(gina)).toEqual({
        chosen_by: 'admin',
        set_by_id: adminId,
      });
    });

    it("makes an admin's own row their own choice, which they see", async () => {
      const own: Member = {
        session: admin,
        id: adminId,
        name: 'Admin',
        email: 'admin@idq.test',
      };
      const set = await adminUpdate(admin, [
        { userId: adminId, visibility: 'named', provinceCode: 'PD' },
      ]);
      expect(set.data).toEqual({ updated: 1, skipped: [] });
      expect(await storedChosenBy(own)).toEqual({
        chosen_by: 'member',
        set_by_id: null,
      });
      expect((await api(admin, '/idq/member-map/me')).data).toEqual({
        provinceCode: 'PD',
        visibility: 'named',
        chosenBy: 'member',
        setBy: null,
      });
      // In the list the admin sees their own choice, and can change it
      expect((await adminList())[adminId]).toMatchObject({
        provinceCode: 'PD',
        visibility: 'named',
        chosenBy: 'member',
        editable: true,
        setByName: null,
      });

      const changed = await adminUpdate(admin, [
        { userId: adminId, visibility: 'count', provinceCode: 'VE' },
      ]);
      expect(changed.data).toEqual({ updated: 1, skipped: [] });
      expect(await storedRow(own)).toEqual({
        province_code: 'VE',
        visibility: 'count',
      });

      // "Not on the map" is remembered as their choice, like in the profile
      const hidden = await adminUpdate(admin, [
        { userId: adminId, visibility: 'hidden' },
      ]);
      expect(hidden.data).toEqual({ updated: 1, skipped: [] });
      expect(await storedRow(own)).toEqual(HIDDEN_ROW);
      expect(await storedChosenBy(own)).toEqual({
        chosen_by: 'member',
        set_by_id: null,
      });
    });

    it('keeps the choice of a member who decides while an admin saves', async () => {
      const [{ workspace_id: workspaceId }] = await sql`
        select workspace_id from users where id = ${ivo.id}`;
      // Ivo's choice, not committed yet: the admin's save can't see it
      const member = await sql.reserve();
      try {
        await member`begin`;
        await member`
          insert into idq_member_locations
            (user_id, workspace_id, province_code, visibility, chosen_by)
          values (${ivo.id}, ${workspaceId}, null, 'hidden', 'member')`;

        const saving = adminUpdate(admin, [
          { userId: ivo.id, visibility: 'named', provinceCode: 'TO' },
        ]);
        // The admin's insert waits for Ivo's transaction...
        await waitFor(async () => {
          const waiting = await sql`
            select 1 from pg_stat_activity
            where wait_event_type = 'Lock'
              and query ilike 'insert into "idq_member_locations"%'`;
          return waiting.length > 0;
        });
        // ...which commits first: the admin's write must not override it
        await member`commit`;

        const { status, data } = await saving;
        expect(status).toBe(200);
        expect(data).toEqual({
          updated: 0,
          skipped: [{ userId: ivo.id, reason: 'chosen-by-member' }],
        });
      } finally {
        await member`rollback`.catch(() => {});
        member.release();
      }
      expect(await storedRow(ivo)).toEqual(HIDDEN_ROW);
      expect(await storedChosenBy(ivo)).toEqual({
        chosen_by: 'member',
        set_by_id: null,
      });
    });

    it("turns into the member's own choice when they change it", async () => {
      await setLocation(fabio, 'count', 'RM');
      expect(
        (await api(fabio.session, '/idq/member-map/me')).data.setBy,
      ).toBeNull();
      const { data } = await adminUpdate(admin, [
        { userId: fabio.id, visibility: 'hidden' },
      ]);
      expect(data.skipped).toEqual([
        { userId: fabio.id, reason: 'chosen-by-member' },
      ]);
      expect(await storedRow(fabio)).toEqual({
        province_code: 'RM',
        visibility: 'count',
      });
    });

    it('removes what an admin set', async () => {
      const { data } = await adminUpdate(admin, [
        { userId: gina.id, visibility: 'hidden', provinceCode: 'NA' },
      ]);
      expect(data).toEqual({ updated: 1, skipped: [] });
      expect(await storedRow(gina)).toBeNull();
    });

    it('skips users who are not active members, and validates the rest', async () => {
      const { data } = await adminUpdate(admin, [
        { userId: dario.id, visibility: 'count', provinceCode: 'BO' },
        {
          userId: '00000000-0000-7000-8000-000000000000',
          visibility: 'count',
          provinceCode: 'BO',
        },
      ]);
      expect(data.skipped.map((s: { reason: string }) => s.reason)).toEqual([
        'not-a-member',
        'not-a-member',
      ]);
      expect(
        (
          await adminUpdate(admin, [
            { userId: gina.id, visibility: 'named', provinceCode: 'XX' },
          ])
        ).status,
      ).toBe(400);
      expect(
        (await adminUpdate(admin, [{ userId: 'nope', visibility: 'count' }]))
          .status,
      ).toBe(400);
      expect(await storedRow(gina)).toBeNull();
    });
  });
});
