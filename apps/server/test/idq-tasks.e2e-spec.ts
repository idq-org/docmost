/**
 * End-to-end test of the task board (issue #3), against a running instance.
 *
 * It needs a new database (the test sets up the workspace):
 *   IDQ_E2E_URL=http://localhost:3300 \
 *   IDQ_E2E_DATABASE_URL=postgresql://docmost:docmost@localhost:55432/docmost \
 *   npx jest --config test/jest-e2e.json --runInBand idq-tasks
 *
 * Without IDQ_E2E_URL the test is skipped.
 */
import * as postgres from 'postgres';

const BASE = process.env.IDQ_E2E_URL;
const DB_URL = process.env.IDQ_E2E_DATABASE_URL;
const describeE2E = BASE && DB_URL ? describe : describe.skip;

const PASSWORD = 'idq-e2e-password-123';
// Appears only in the restricted space: no board response may contain it.
const SECRET_WORD = 'marzipansecret';

type Session = { cookie: string };

async function api(session: Session | null, path: string, body: object = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(session ? { cookie: session.cookie } : {}),
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

describeE2E('IDQ task board (e2e)', () => {
  let sql: postgres.Sql;
  let admin: Session;
  let member: Session;
  let reader: Session;
  let adminId: string;
  let memberId: string;
  let readerId: string;
  let workspaceId: string;
  let sharedSpaceId: string;
  let secretSpaceId: string;
  let taskId: string;
  let otherTaskId: string;
  let notTaskId: string;
  let materialPageId: string;
  let indexPageId: string;
  let secretTaskId: string;
  let secretPageId: string;
  let sharedAttachmentId: string;
  let secretAttachmentId: string;

  async function invite(email: string, name: string): Promise<Session> {
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
    return login(email);
  }

  async function createPage(
    spaceId: string,
    title: string,
    labels: string[],
    parentPageId?: string,
  ) {
    const page = await api(admin, '/pages/create', {
      spaceId,
      title,
      parentPageId,
    });
    expect(page.status).toBe(200);
    if (labels.length > 0) {
      const added = await api(admin, '/pages/labels/add', {
        pageId: page.data.id,
        names: labels,
      });
      expect(added.status).toBe(200);
    }
    return page.data.id as string;
  }

  async function addAttachment(pageId: string, spaceId: string, name: string) {
    const [row] = await sql`
      insert into attachments (file_name, file_path, file_size, file_ext, mime_type, type,
        creator_id, page_id, space_id, workspace_id)
      values (${name}, ${'test/' + name}, 1234, '.pdf', 'application/pdf', 'file',
        ${adminId}, ${pageId}, ${spaceId}, ${workspaceId})
      returning id`;
    return row.id as string;
  }

  async function labelsOf(pageId: string): Promise<string[]> {
    const rows = await sql`
      select l.name from page_labels pl join labels l on l.id = pl.label_id
      where pl.page_id = ${pageId} order by l.name`;
    return rows.map((r) => r.name);
  }

  function expectNoSecret(text: string) {
    expect(text).not.toContain(SECRET_WORD);
  }

  beforeAll(async () => {
    sql = postgres(DB_URL!, { max: 2, onnotice: () => {} });

    const setup = await api(null, '/auth/setup', {
      workspaceName: 'IDQ tasks test',
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
    [{ id: workspaceId }] = await sql`select id from workspaces limit 1`;
    [{ id: adminId }] =
      await sql`select id from users where email = 'admin@idq.test'`;

    member = await invite('mario.rossi@idq.test', 'Mario Rossi');
    memberId = (await api(member, '/users/me')).data.user.id;
    reader = await invite('reader@idq.test', 'Reader');
    readerId = (await api(reader, '/users/me')).data.user.id;

    // "Tasks" space: member writes, reader reads. "Board" space: admin only.
    sharedSpaceId = (
      await api(admin, '/spaces/create', { name: 'Tasks', slug: 'tasks' })
    ).data.id;
    await api(admin, '/spaces/members/add', {
      spaceId: sharedSpaceId,
      userIds: [memberId],
      groupIds: [],
      role: 'writer',
    });
    await api(admin, '/spaces/members/add', {
      spaceId: sharedSpaceId,
      userIds: [readerId],
      groupIds: [],
      role: 'reader',
    });
    secretSpaceId = (
      await api(admin, '/spaces/create', { name: 'Board', slug: 'board' })
    ).data.id;

    // As in the association's spaces: tasks are children of an index page.
    indexPageId = await createPage(sharedSpaceId, 'Tasks', []);
    taskId = await createPage(
      sharedSpaceId,
      'Grant application',
      ['stato-da-fare', 'priorita-alta', 'area-scuole', 'ref-mario-rossi'],
      indexPageId,
    );
    otherTaskId = await createPage(
      sharedSpaceId,
      'Old task',
      ['stato-bloccato', 'ref-volunteer'],
      indexPageId,
    );
    notTaskId = await createPage(sharedSpaceId, 'Meeting notes', ['verbale']);
    materialPageId = await createPage(sharedSpaceId, 'Grant dossier', []);

    secretTaskId = await createPage(secretSpaceId, `Budget ${SECRET_WORD}`, [
      'stato-in-corso',
      `ref-${SECRET_WORD}`,
    ]);
    secretPageId = await createPage(
      secretSpaceId,
      `Minutes ${SECRET_WORD}`,
      [],
    );

    sharedAttachmentId = await addAttachment(
      materialPageId,
      sharedSpaceId,
      'call-for-proposals.pdf',
    );
    secretAttachmentId = await addAttachment(
      secretPageId,
      secretSpaceId,
      `accounts-${SECRET_WORD}.pdf`,
    );
  }, 60_000);

  afterAll(async () => {
    await sql?.end();
  });

  describe('board', () => {
    it('shows the tasks of the space, by status', async () => {
      const res = await api(member, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      expect(res.status).toBe(200);
      expect(res.data.canCreate).toBe(true);
      expect(res.data.statuses).toEqual([
        'todo',
        'in_progress',
        'to_decide',
        'waiting',
        'blocked',
        'to_review',
        'done',
      ]);

      const ids = res.data.tasks.map((t: any) => t.pageId);
      expect(ids).toEqual(expect.arrayContaining([taskId, otherTaskId]));
      expect(ids).not.toContain(notTaskId);
      expect(ids).not.toContain(indexPageId);
      expect(ids).not.toContain(materialPageId);

      const task = res.data.tasks.find((t: any) => t.pageId === taskId);
      expect(task).toMatchObject({
        status: 'todo',
        priority: 'alta',
        areas: ['scuole'],
        canEdit: true,
        linkCount: 0,
        nextDeadline: null,
      });
      // ref-mario-rossi is the member; no email leaves the server
      expect(task.assignees).toEqual([
        {
          value: 'mario-rossi',
          name: 'Mario Rossi',
          user: { id: memberId, name: 'Mario Rossi', avatarUrl: null },
        },
      ]);
      expect(res.text).not.toContain('@idq.test');

      const old = res.data.tasks.find((t: any) => t.pageId === otherTaskId);
      expect(old.status).toBe('blocked');
      // A name without an account
      expect(old.assignees).toEqual([
        { value: 'volunteer', name: 'Volunteer', user: null },
      ]);
    });

    it('readers see the board but cannot change it', async () => {
      const res = await api(reader, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      expect(res.status).toBe(200);
      expect(res.data.canCreate).toBe(false);
      expect(res.data.tasks.length).toBeGreaterThan(0);
      expect(res.data.tasks.every((t: any) => t.canEdit === false)).toBe(true);
    });

    it('does not show the board of a space the user cannot see', async () => {
      const res = await api(member, '/idq/tasks/board', {
        spaceId: secretSpaceId,
      });
      expect([403, 404]).toContain(res.status);
      expectNoSecret(res.text);
    });

    it('requires a login', async () => {
      const res = await api(null, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('moving cards', () => {
    it('a writer changes the status, and it stays', async () => {
      const res = await api(member, '/idq/tasks/set-status', {
        pageId: taskId,
        status: 'in_progress',
      });
      expect(res.status).toBe(200);

      expect(await labelsOf(taskId)).toEqual([
        'area-scuole',
        'priorita-alta',
        'ref-mario-rossi',
        'stato-in-corso',
      ]);
      const board = await api(member, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      const task = board.data.tasks.find((t: any) => t.pageId === taskId);
      expect(task.status).toBe('in_progress');
    });

    it('replaces every status label, and keeps labels still in use', async () => {
      // otherTask has stato-bloccato; secretTask uses stato-in-corso too
      await api(admin, '/pages/labels/add', {
        pageId: otherTaskId,
        names: ['stato-in-corso'],
      });
      const res = await api(member, '/idq/tasks/set-status', {
        pageId: otherTaskId,
        status: 'done',
      });
      expect(res.status).toBe(200);
      expect(await labelsOf(otherTaskId)).toEqual([
        'ref-volunteer',
        'stato-fatto',
      ]);
      // stato-bloccato had no other page: deleted, as Docmost does
      const [{ count: bloccato }] =
        await sql`select count(*)::int from labels where name = 'stato-bloccato'`;
      expect(bloccato).toBe(0);
      const [{ count: inCorso }] =
        await sql`select count(*)::int from labels where name = 'stato-in-corso'`;
      expect(inCorso).toBe(1);
    });

    it('readers cannot move cards', async () => {
      const res = await api(reader, '/idq/tasks/set-status', {
        pageId: taskId,
        status: 'done',
      });
      expect(res.status).toBe(403);
      expect(await labelsOf(taskId)).toContain('stato-in-corso');
    });

    it('cannot move tasks of a space the user cannot see', async () => {
      const res = await api(member, '/idq/tasks/set-status', {
        pageId: secretTaskId,
        status: 'done',
      });
      expect(res.status).toBe(404);
      expectNoSecret(res.text);
      expect(await labelsOf(secretTaskId)).toContain('stato-in-corso');
    });

    it('rejects unknown statuses and pages that are not tasks', async () => {
      const bad = await api(member, '/idq/tasks/set-status', {
        pageId: taskId,
        status: 'archived',
      });
      expect(bad.status).toBe(400);
      const notTask = await api(member, '/idq/tasks/set-status', {
        pageId: notTaskId,
        status: 'done',
      });
      expect(notTask.status).toBe(400);
      expect(await labelsOf(notTaskId)).toEqual(['verbale']);
    });
  });

  describe('new tasks', () => {
    it('a writer creates a task page in a column, next to the others', async () => {
      const res = await api(member, '/idq/tasks/create', {
        spaceId: sharedSpaceId,
        title: '  Call the school  ',
        status: 'waiting',
        content: '## Goal\n\n## Steps\n\n- [ ] First step\n',
      });
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        title: 'Call the school',
        status: 'waiting',
        canEdit: true,
      });
      const [page] = await sql`
        select space_id, parent_page_id, content::text as content
        from pages where id = ${res.data.pageId}`;
      expect(page.space_id).toBe(sharedSpaceId);
      // Under the index page that holds the other tasks
      expect(page.parent_page_id).toBe(indexPageId);
      expect(page.content).toContain('First step');
      expect(page.content).toContain('taskItem');
      expect(await labelsOf(res.data.pageId)).toEqual(['stato-in-attesa']);
    });

    it('readers and non-members cannot create tasks', async () => {
      const byReader = await api(reader, '/idq/tasks/create', {
        spaceId: sharedSpaceId,
        title: 'No',
        status: 'todo',
      });
      expect(byReader.status).toBe(403);
      const elsewhere = await api(member, '/idq/tasks/create', {
        spaceId: secretSpaceId,
        title: 'No',
        status: 'todo',
      });
      expect([403, 404]).toContain(elsewhere.status);
      const [{ count }] =
        await sql`select count(*)::int from pages where title = 'No'`;
      expect(count).toBe(0);
    });

    it('rejects an empty title', async () => {
      const res = await api(member, '/idq/tasks/create', {
        spaceId: sharedSpaceId,
        title: '   ',
        status: 'todo',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('task fields', () => {
    let fieldsTaskId: string;

    beforeAll(async () => {
      const res = await api(member, '/idq/tasks/create', {
        spaceId: sharedSpaceId,
        title: 'Fields task',
        status: 'todo',
      });
      fieldsTaskId = res.data.pageId;
    });

    it('a writer sets priority, areas and people in charge', async () => {
      const res = await api(member, '/idq/tasks/set-fields', {
        pageId: fieldsTaskId,
        priority: 'Massima',
        areas: ['Offerta formativa'],
        assignees: ['mario-rossi', 'Volontario Esterno'],
      });
      expect(res.status).toBe(200);
      expect(await labelsOf(fieldsTaskId)).toEqual([
        'area-offerta-formativa',
        'priorita-massima',
        'ref-mario-rossi',
        'ref-volontario-esterno',
        'stato-da-fare',
      ]);

      const info = await api(member, '/idq/tasks/page-info', {
        pageId: fieldsTaskId,
      });
      expect(info.data.task).toMatchObject({
        priority: 'massima',
        areas: ['offerta-formativa'],
      });
      expect(info.data.task.assignees.map((a: any) => a.name)).toEqual([
        'Mario Rossi',
        'Volontario Esterno',
      ]);
    });

    it('only changes the fields that are sent', async () => {
      const res = await api(member, '/idq/tasks/set-fields', {
        pageId: fieldsTaskId,
        priority: null,
      });
      expect(res.status).toBe(200);
      expect(await labelsOf(fieldsTaskId)).toEqual([
        'area-offerta-formativa',
        'ref-mario-rossi',
        'ref-volontario-esterno',
        'stato-da-fare',
      ]);
      // priorita-massima had no other page
      const [{ count }] =
        await sql`select count(*)::int from labels where name = 'priorita-massima'`;
      expect(count).toBe(0);
    });

    it('rejects values that cannot be labels', async () => {
      const res = await api(member, '/idq/tasks/set-fields', {
        pageId: fieldsTaskId,
        areas: ['~hidden'],
      });
      expect(res.status).toBe(400);
    });

    it('readers, pages that are not tasks and hidden tasks are refused', async () => {
      const byReader = await api(reader, '/idq/tasks/set-fields', {
        pageId: fieldsTaskId,
        priority: 'bassa',
      });
      expect(byReader.status).toBe(403);
      const notTask = await api(member, '/idq/tasks/set-fields', {
        pageId: notTaskId,
        priority: 'bassa',
      });
      expect(notTask.status).toBe(400);
      const hidden = await api(member, '/idq/tasks/set-fields', {
        pageId: secretTaskId,
        priority: 'bassa',
      });
      expect(hidden.status).toBe(404);
      expectNoSecret(hidden.text);
      expect(await labelsOf(secretTaskId)).not.toContain('priorita-bassa');
    });

    it('offers the values in use in the spaces the user can see', async () => {
      const res = await api(member, '/idq/tasks/field-options', {
        spaceId: sharedSpaceId,
      });
      expect(res.status).toBe(200);
      expect(res.data.priorities).toContain('alta');
      expect(res.data.areas).toEqual(['offerta-formativa', 'scuole']);
      expect(res.data.assignees.map((a: any) => a.value)).toEqual(
        expect.arrayContaining(['mario-rossi', 'volontario-esterno']),
      );
      expect(res.data.members).toEqual(
        expect.arrayContaining([
          {
            id: memberId,
            name: 'Mario Rossi',
            avatarUrl: null,
            value: 'mario-rossi',
          },
        ]),
      );
      expectNoSecret(res.text);
      expect(res.text).not.toContain('@idq.test');

      const elsewhere = await api(member, '/idq/tasks/field-options', {
        spaceId: secretSpaceId,
      });
      expect([403, 404]).toContain(elsewhere.status);
    });
  });

  describe('people in charge', () => {
    it('only workspace admins see and change who a ref- label stands for', async () => {
      expect((await api(member, '/idq/tasks/assignees/list')).status).toBe(403);
      const set = await api(member, '/idq/tasks/assignees/set', {
        value: 'volunteer',
        userId: memberId,
      });
      expect(set.status).toBe(403);
      const [{ count }] =
        await sql`select count(*)::int from idq_task_assignees`;
      expect(count).toBe(0);
    });

    it('an admin links a name to a member', async () => {
      const set = await api(admin, '/idq/tasks/assignees/set', {
        value: 'volunteer',
        userId: readerId,
      });
      expect(set.status).toBe(200);

      const list = await api(admin, '/idq/tasks/assignees/list');
      expect(list.status).toBe(200);
      expect(list.data).toEqual(
        expect.arrayContaining([
          {
            value: 'volunteer',
            user: { id: readerId, name: 'Reader', avatarUrl: null },
            automatic: null,
          },
          {
            value: 'mario-rossi',
            user: null,
            automatic: { id: memberId, name: 'Mario Rossi', avatarUrl: null },
          },
        ]),
      );
      expect(list.text).not.toContain('@idq.test');

      const board = await api(member, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      const old = board.data.tasks.find((t: any) => t.pageId === otherTaskId);
      expect(old.assignees).toEqual([
        {
          value: 'volunteer',
          name: 'Reader',
          user: { id: readerId, name: 'Reader', avatarUrl: null },
        },
      ]);

      // The member list proposes the linked value for that member
      const options = await api(member, '/idq/tasks/field-options', {
        spaceId: sharedSpaceId,
      });
      expect(
        options.data.members.find((m: any) => m.id === readerId).value,
      ).toBe('volunteer');
    });

    it('a link wins over the match by name, and can be removed', async () => {
      await api(admin, '/idq/tasks/assignees/set', {
        value: 'mario-rossi',
        userId: readerId,
      });
      let board = await api(member, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      let task = board.data.tasks.find((t: any) => t.pageId === taskId);
      expect(task.assignees[0].user.id).toBe(readerId);

      const removed = await api(admin, '/idq/tasks/assignees/set', {
        value: 'mario-rossi',
        userId: null,
      });
      expect(removed.status).toBe(200);
      board = await api(member, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      task = board.data.tasks.find((t: any) => t.pageId === taskId);
      expect(task.assignees[0].user.id).toBe(memberId);
    });

    it('rejects unknown users', async () => {
      const res = await api(admin, '/idq/tasks/assignees/set', {
        value: 'volunteer',
        userId: '01a00000-0000-7000-8000-000000000000',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('linked materials', () => {
    let urlLinkId: string;

    it('a writer links a page, a file and an external link', async () => {
      const page = await api(member, '/idq/tasks/links/add', {
        taskPageId: taskId,
        type: 'page',
        targetPageId: materialPageId,
      });
      expect(page.status).toBe(200);
      expect(page.data).toMatchObject({
        type: 'page',
        title: 'Grant dossier',
        page: { id: materialPageId, spaceSlug: 'tasks' },
      });

      // Linking the same page again returns the same link
      const again = await api(member, '/idq/tasks/links/add', {
        taskPageId: taskId,
        type: 'page',
        targetPageId: materialPageId,
      });
      expect(again.data.id).toBe(page.data.id);

      const file = await api(member, '/idq/tasks/links/add', {
        taskPageId: taskId,
        type: 'attachment',
        attachmentId: sharedAttachmentId,
      });
      expect(file.status).toBe(200);
      expect(file.data.attachment).toMatchObject({
        id: sharedAttachmentId,
        fileName: 'call-for-proposals.pdf',
        fileSize: 1234,
      });

      const url = await api(member, '/idq/tasks/links/add', {
        taskPageId: taskId,
        type: 'url',
        url: 'https://drive.example.org/folder/123',
        title: 'Shared folder',
      });
      expect(url.status).toBe(200);
      expect(url.data).toMatchObject({
        type: 'url',
        title: 'Shared folder',
        url: 'https://drive.example.org/folder/123',
      });
      urlLinkId = url.data.id;
    });

    it('rejects links that are not http(s)', async () => {
      for (const bad of [
        'javascript:alert(1)',
        'data:text/html,x',
        'ftp://x.org',
      ]) {
        const res = await api(member, '/idq/tasks/links/add', {
          taskPageId: taskId,
          type: 'url',
          url: bad,
        });
        expect(res.status).toBe(400);
      }
    });

    it('cannot link pages or files the user cannot see', async () => {
      const page = await api(member, '/idq/tasks/links/add', {
        taskPageId: taskId,
        type: 'page',
        targetPageId: secretPageId,
      });
      expect(page.status).toBe(404);
      expectNoSecret(page.text);

      const file = await api(member, '/idq/tasks/links/add', {
        taskPageId: taskId,
        type: 'attachment',
        attachmentId: secretAttachmentId,
      });
      expect(file.status).toBe(404);
      expectNoSecret(file.text);
    });

    it('readers cannot add or remove links', async () => {
      const add = await api(reader, '/idq/tasks/links/add', {
        taskPageId: taskId,
        type: 'url',
        url: 'https://example.org',
      });
      expect(add.status).toBe(403);
      const remove = await api(reader, '/idq/tasks/links/remove', {
        linkId: urlLinkId,
      });
      expect(remove.status).toBe(403);
    });

    it('hides links to pages and files that the viewer cannot see', async () => {
      // The admin sees both spaces and links restricted material to a
      // task of the shared space.
      for (const body of [
        { type: 'page', targetPageId: secretPageId },
        { type: 'attachment', attachmentId: secretAttachmentId },
      ]) {
        const res = await api(admin, '/idq/tasks/links/add', {
          taskPageId: taskId,
          ...body,
        });
        expect(res.status).toBe(200);
      }

      const adminInfo = await api(admin, '/idq/tasks/page-info', {
        pageId: taskId,
      });
      expect(adminInfo.data.links).toHaveLength(5);

      for (const viewer of [member, reader]) {
        const info = await api(viewer, '/idq/tasks/page-info', {
          pageId: taskId,
        });
        expect(info.status).toBe(200);
        expect(info.data.isTask).toBe(true);
        expect(info.data.links.map((l: any) => l.type)).toEqual([
          'page',
          'attachment',
          'url',
        ]);
        expectNoSecret(info.text);

        const board = await api(viewer, '/idq/tasks/board', {
          spaceId: sharedSpaceId,
        });
        const task = board.data.tasks.find((t: any) => t.pageId === taskId);
        expect(task.linkCount).toBe(3);
        expectNoSecret(board.text);
      }

      const adminBoard = await api(admin, '/idq/tasks/board', {
        spaceId: sharedSpaceId,
      });
      expect(
        adminBoard.data.tasks.find((t: any) => t.pageId === taskId).linkCount,
      ).toBe(5);
    });

    it('a linked page shows the tasks that use it, if visible', async () => {
      // A restricted task links the same page
      const secretLink = await api(admin, '/idq/tasks/links/add', {
        taskPageId: secretTaskId,
        type: 'page',
        targetPageId: materialPageId,
      });
      expect(secretLink.status).toBe(200);

      const info = await api(member, '/idq/tasks/page-info', {
        pageId: materialPageId,
      });
      expect(info.status).toBe(200);
      expect(info.data.isTask).toBe(false);
      expect(info.data.links).toEqual([]);
      expect(info.data.usedIn).toEqual([
        expect.objectContaining({
          taskPageId: taskId,
          title: 'Grant application',
          status: 'in_progress',
        }),
      ]);
      expectNoSecret(info.text);

      const adminInfo = await api(admin, '/idq/tasks/page-info', {
        pageId: materialPageId,
      });
      expect(adminInfo.data.usedIn).toHaveLength(2);
    });

    it('page-info of a page the user cannot see is not found', async () => {
      for (const pageId of [secretTaskId, secretPageId]) {
        const res = await api(member, '/idq/tasks/page-info', { pageId });
        expect(res.status).toBe(404);
        expectNoSecret(res.text);
      }
    });

    it('attachment search only returns files the user can open', async () => {
      const res = await api(member, '/idq/tasks/attachments/search', {
        query: '',
      });
      expect(res.status).toBe(200);
      expect(res.data.map((a: any) => a.id)).toEqual([sharedAttachmentId]);
      expectNoSecret(res.text);
    });

    it('a writer removes a link', async () => {
      const res = await api(member, '/idq/tasks/links/remove', {
        linkId: urlLinkId,
      });
      expect(res.status).toBe(200);
      const info = await api(member, '/idq/tasks/page-info', {
        pageId: taskId,
      });
      expect(info.data.links.map((l: any) => l.type)).toEqual([
        'page',
        'attachment',
      ]);
    });

    it('cannot remove links of tasks the user cannot see', async () => {
      const [row] = await sql`
        select id from idq_task_links where task_page_id = ${secretTaskId}`;
      const res = await api(member, '/idq/tasks/links/remove', {
        linkId: row.id,
      });
      expect(res.status).toBe(404);
      const [{ count }] = await sql`
        select count(*)::int from idq_task_links where id = ${row.id}`;
      expect(count).toBe(1);
    });

    it('links go away with the task page', async () => {
      await api(admin, '/pages/delete', {
        pageId: secretTaskId,
        permanentlyDelete: true,
      });
      const [{ count }] = await sql`
        select count(*)::int from idq_task_links where task_page_id = ${secretTaskId}`;
      expect(count).toBe(0);
    });
  });
});
