/**
 * Test end-to-end dell'MCP di IDQ (issue #5), contro un'istanza che gira.
 *
 * Serve un database nuovo (il test fa il setup del workspace):
 *   IDQ_E2E_URL=http://localhost:3300 \
 *   IDQ_E2E_DATABASE_URL=postgresql://docmost:docmost@localhost:55432/docmost \
 *   npx jest --config test/jest-e2e.json --runInBand idq-mcp
 *
 * Senza IDQ_E2E_URL il test viene saltato.
 */
import * as postgres from 'postgres';

const BASE = process.env.IDQ_E2E_URL;
const DB_URL = process.env.IDQ_E2E_DATABASE_URL;
const describeE2E = BASE && DB_URL ? describe : describe.skip;

const EXPECTED_TOOLS = [
  'search_pages',
  'get_page',
  'create_page',
  'update_page',
  'list_pages',
  'list_child_pages',
  'duplicate_page',
  'copy_page_to_space',
  'move_page',
  'move_page_to_space',
  'get_space',
  'list_spaces',
  'create_space',
  'update_space',
  'get_comments',
  'create_comment',
  'update_comment',
  'search_attachments',
  'list_workspace_members',
  'get_current_user',
].sort();

const PASSWORD = 'idq-e2e-password-123';
const SECRET_WORD = 'zafferanosegreto';

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
  return { status: res.status, data: json?.data, raw: json, res };
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

let rpcId = 0;
async function mcp(
  key: string | null,
  method: string,
  params: object = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const text = await res.text();
  let body: any = undefined;
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .pop();
    body = data ? JSON.parse(data) : undefined;
  } else if (text) {
    body = JSON.parse(text);
  }
  return { status: res.status, body };
}

async function callTool(key: string, name: string, args: object = {}) {
  const { status, body } = await mcp(key, 'tools/call', {
    name,
    arguments: args,
  });
  expect(status).toBe(200);
  const result = body.result;
  const text = result?.content?.[0]?.text ?? '';
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* testo semplice */
  }
  return { isError: Boolean(result?.isError), data: parsed, text };
}

describeE2E('IDQ MCP (e2e)', () => {
  let sql: postgres.Sql;
  let admin: Session;
  let member: Session;
  let memberKey: string;
  let memberKeyId: string;
  let adminKey: string;
  let memberId: string;
  let sharedSpaceId: string;
  let secretSpaceId: string;
  let secretPageId: string;
  let secretPageSlugId: string;
  let sharedPageId: string;

  beforeAll(async () => {
    sql = postgres(DB_URL!, { max: 2, onnotice: () => {} });

    // Workspace e admin
    const setup = await api(null, '/auth/setup', {
      workspaceName: 'IDQ test',
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

    // Socio invitato
    await api(admin, '/workspace/invites/create', {
      emails: ['socio@idq.test'],
      role: 'member',
    });
    const [invite] = await sql`
      select id, token from workspace_invitations where email = 'socio@idq.test'`;
    const accepted = await api(null, '/workspace/invites/accept', {
      invitationId: invite.id,
      token: invite.token,
      name: 'Socio',
      password: PASSWORD,
    });
    expect(accepted.status).toBe(200);
    member = await login('socio@idq.test');
    memberId = (await api(member, '/users/me')).data.user.id;

    // Spazio condiviso (il socio è writer) e spazio riservato (solo admin)
    const shared = await api(admin, '/spaces/create', {
      name: 'Comune',
      slug: 'comune',
    });
    sharedSpaceId = shared.data.id;
    await api(admin, '/spaces/members/add', {
      spaceId: sharedSpaceId,
      userIds: [memberId],
      groupIds: [],
      role: 'writer',
    });
    const secret = await api(admin, '/spaces/create', {
      name: 'Riservato',
      slug: 'riservato',
    });
    secretSpaceId = secret.data.id;

    const secretPage = await api(admin, '/pages/create', {
      spaceId: secretSpaceId,
      title: `Verbale ${SECRET_WORD}`,
      content: `Contenuto riservato: ${SECRET_WORD}`,
      format: 'markdown',
    });
    secretPageId = secretPage.data.id;
    secretPageSlugId = secretPage.data.slugId;
    await api(admin, '/comments/create', {
      pageId: secretPageId,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `commento ${SECRET_WORD}` }],
          },
        ],
      }),
      type: 'page',
    });

    const sharedPage = await api(admin, '/pages/create', {
      spaceId: sharedSpaceId,
      title: 'Pagina comune',
      content: 'Benvenuti',
      format: 'markdown',
    });
    sharedPageId = sharedPage.data.id;

    // Allegati: uno nello spazio riservato e uno in quello comune
    const [ws] = await sql`select id from workspaces limit 1`;
    const [adminRow] =
      await sql`select id from users where email = 'admin@idq.test'`;
    for (const [pageId, spaceId, name] of [
      [secretPageId, secretSpaceId, `bilancio-${SECRET_WORD}.pdf`],
      [sharedPageId, sharedSpaceId, `bilancio-pubblico.pdf`],
    ]) {
      await sql`
        insert into attachments (file_name, file_path, file_size, file_ext, mime_type, type,
          creator_id, page_id, space_id, workspace_id)
        values (${name}, ${'test/' + name}, 1234, '.pdf', 'application/pdf', 'file',
          ${adminRow.id}, ${pageId}, ${spaceId}, ${ws.id})`;
    }

    const created = await api(member, '/idq/api-keys/create', {
      name: 'test',
    });
    memberKey = created.data.key;
    memberKeyId = created.data.id;
    adminKey = (await api(admin, '/idq/api-keys/create', { name: 'admin' }))
      .data.key;
  }, 60_000);

  afterAll(async () => {
    await sql?.end();
  });

  describe('switch and authentication', () => {
    it('rejects requests without a valid key', async () => {
      expect((await mcp(null, 'tools/list')).status).toBe(401);
      expect((await mcp('idq_wrong', 'tools/list')).status).toBe(401);
    });

    it('is disabled until an admin enables it', async () => {
      expect((await mcp(memberKey, 'tools/list')).status).toBe(403);
    });

    it('only admins can change the switch', async () => {
      const res = await api(member, '/idq/settings/update', {
        idqMcpEnabled: true,
      });
      expect(res.status).toBe(403);
      const ok = await api(admin, '/idq/settings/update', {
        idqMcpEnabled: true,
      });
      expect(ok.status).toBe(200);
      expect(ok.data.idqMcpEnabled).toBe(true);
    });

    it('API keys cannot manage API keys', async () => {
      const res = await fetch(`${BASE}/api/idq/api-keys/create`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${memberKey}`,
        },
        body: JSON.stringify({ name: 'x' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('protocol', () => {
    it('answers initialize', async () => {
      const { status, body } = await mcp(memberKey, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1' },
      });
      expect(status).toBe(200);
      expect(body.result.serverInfo.name).toBe('idq-docmost');
    });

    it('lists the 20 tools with the Docmost names', async () => {
      const { body } = await mcp(memberKey, 'tools/list');
      const names = body.result.tools.map((t: any) => t.name).sort();
      expect(names).toEqual(EXPECTED_TOOLS);
    });
  });

  describe('a member who cannot see a reserved space', () => {
    it('get_current_user returns the key owner', async () => {
      const { data } = await callTool(memberKey, 'get_current_user');
      expect(data.user.email).toBe('socio@idq.test');
    });

    it('list_spaces does not include it', async () => {
      const { data } = await callTool(memberKey, 'list_spaces');
      const ids = data.items.map((s: any) => s.id);
      expect(ids).toContain(sharedSpaceId);
      expect(ids).not.toContain(secretSpaceId);
    });

    it('get_space is forbidden', async () => {
      const r = await callTool(memberKey, 'get_space', {
        space_id: secretSpaceId,
      });
      expect(r.isError).toBe(true);
    });

    it('search_pages finds nothing from it', async () => {
      const r = await callTool(memberKey, 'search_pages', {
        query: SECRET_WORD,
      });
      expect(r.isError).toBe(false);
      expect(r.data.items).toHaveLength(0);

      const inSpace = await callTool(memberKey, 'search_pages', {
        query: SECRET_WORD,
        space_id: secretSpaceId,
      });
      expect(inSpace.isError).toBe(true);
    });

    it('get_page is forbidden, by id and by slug id', async () => {
      for (const pageId of [secretPageId, secretPageSlugId]) {
        const r = await callTool(memberKey, 'get_page', { page_id: pageId });
        expect(r.isError).toBe(true);
        expect(r.text).not.toContain(SECRET_WORD);
      }
    });

    it('list_pages and list_child_pages do not show its pages', async () => {
      const recent = await callTool(memberKey, 'list_pages', {});
      expect(JSON.stringify(recent.data)).not.toContain(SECRET_WORD);

      expect(
        (await callTool(memberKey, 'list_pages', { space_id: secretSpaceId }))
          .isError,
      ).toBe(true);
      expect(
        (
          await callTool(memberKey, 'list_child_pages', {
            space_id: secretSpaceId,
          })
        ).isError,
      ).toBe(true);
      expect(
        (
          await callTool(memberKey, 'list_child_pages', {
            page_id: secretPageId,
          })
        ).isError,
      ).toBe(true);
    });

    it('get_comments and create_comment are forbidden', async () => {
      const read = await callTool(memberKey, 'get_comments', {
        page_id: secretPageId,
      });
      expect(read.isError).toBe(true);
      expect(read.text).not.toContain(SECRET_WORD);
      const write = await callTool(memberKey, 'create_comment', {
        page_id: secretPageId,
        markdown: 'ciao',
      });
      expect(write.isError).toBe(true);
    });

    it('search_attachments does not return its files', async () => {
      const r = await callTool(memberKey, 'search_attachments', {
        query: 'bilancio',
      });
      const names = r.data.items.map((a: any) => a.fileName);
      expect(names).toContain('bilancio-pubblico.pdf');
      expect(names.join()).not.toContain(SECRET_WORD);

      const inSpace = await callTool(memberKey, 'search_attachments', {
        query: 'bilancio',
        space_id: secretSpaceId,
      });
      expect(inSpace.isError).toBe(true);
    });

    it('cannot write, copy or move anything in or out of it', async () => {
      const attempts: [string, object][] = [
        ['create_page', { space_id: secretSpaceId, title: 'x' }],
        [
          'create_page',
          { space_id: sharedSpaceId, title: 'x', parent_page_id: secretPageId },
        ],
        ['update_page', { page_id: secretPageId, title: 'x' }],
        ['duplicate_page', { page_id: secretPageId }],
        [
          'copy_page_to_space',
          { page_id: secretPageId, space_id: sharedSpaceId },
        ],
        [
          'copy_page_to_space',
          { page_id: sharedPageId, space_id: secretSpaceId },
        ],
        ['move_page', { page_id: secretPageId, parent_page_id: null }],
        ['move_page', { page_id: sharedPageId, parent_page_id: secretPageId }],
        [
          'move_page_to_space',
          { page_id: sharedPageId, space_id: secretSpaceId },
        ],
        [
          'move_page_to_space',
          { page_id: secretPageId, space_id: sharedSpaceId },
        ],
        ['update_space', { space_id: secretSpaceId, name: 'Rinominato' }],
      ];
      for (const [tool, args] of attempts) {
        const r = await callTool(memberKey, tool, args);
        if (!r.isError) throw new Error(`${tool} should fail: ${r.text}`);
        expect(r.text).not.toContain(SECRET_WORD);
      }

      const [page] = await sql`
        select title, space_id, deleted_at from pages where id = ${secretPageId}`;
      expect(page.title).toBe(`Verbale ${SECRET_WORD}`);
      expect(page.space_id).toBe(secretSpaceId);
      const [{ count }] = await sql`
        select count(*)::int as count from pages where space_id = ${secretSpaceId}`;
      expect(count).toBe(1);
    });

    it('cannot create spaces as a plain member', async () => {
      const r = await callTool(memberKey, 'create_space', {
        name: 'Nuovo',
        slug: 'nuovo',
      });
      expect(r.isError).toBe(true);
    });

    it('the admin, who is in the space, can read it', async () => {
      const r = await callTool(adminKey, 'get_page', { page_id: secretPageId });
      expect(r.isError).toBe(false);
      expect(r.data.content).toContain(SECRET_WORD);
    });
  });

  describe('pages in Markdown', () => {
    const markdown = [
      '# Titolo',
      '',
      '## Sottotitolo',
      '',
      '- uno',
      '- due',
      '',
      '1. primo',
      '2. secondo',
      '',
      '| Nome | Ruolo |',
      '| --- | --- |',
      '| Ada | socia |',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
    ].join('\n');

    let pageId: string;

    it('create_page writes headings, lists, tables and Mermaid', async () => {
      const r = await callTool(memberKey, 'create_page', {
        space_id: sharedSpaceId,
        title: 'Markdown',
        markdown: markdown,
      });
      expect(r.isError).toBe(false);
      pageId = r.data.id;
      expect(r.data.url).toContain('/s/comune/p/markdown-');

      const [row] = await sql`select content from pages where id = ${pageId}`;
      const types = new Set<string>();
      const walk = (n: any) => {
        if (!n) return;
        types.add(n.type);
        (n.content ?? []).forEach(walk);
      };
      walk(row.content);
      for (const t of [
        'heading',
        'bulletList',
        'orderedList',
        'table',
        'tableRow',
      ]) {
        expect(types).toContain(t);
      }
      const json = JSON.stringify(row.content);
      expect(json).toContain('mermaid');
      expect(json).toContain('A --> B');
    });

    it('get_page returns the same structure as Markdown', async () => {
      const r = await callTool(memberKey, 'get_page', { page_id: pageId });
      expect(r.data.content).toMatch(/^# Titolo/m);
      expect(r.data.content).toMatch(/^## Sottotitolo/m);
      expect(r.data.content).toMatch(/^[-*] uno/m);
      expect(r.data.content).toMatch(/^1\. primo/m);
      expect(r.data.content).toMatch(/\|\s*Ada\s*\|\s*socia\s*\|/);
      expect(r.data.content).toContain('```mermaid');
      expect(r.data.permissions.canEdit).toBe(true);
    });

    it('update_page replaces and appends content', async () => {
      const replaced = await callTool(memberKey, 'update_page', {
        page_id: pageId,
        title: 'Markdown 2',
        markdown: 'Nuovo testo',
      });
      expect(replaced.isError).toBe(false);
      expect(replaced.data.title).toBe('Markdown 2');

      await callTool(memberKey, 'update_page', {
        page_id: pageId,
        markdown: 'Aggiunta',
        operation: 'append',
      });
      const r = await callTool(memberKey, 'get_page', { page_id: pageId });
      expect(r.data.content).toContain('Nuovo testo');
      expect(r.data.content).toContain('Aggiunta');
      expect(r.data.content).not.toContain('Sottotitolo');
    });

    it('moves, duplicates and lists child pages', async () => {
      const moved = await callTool(memberKey, 'move_page', {
        page_id: pageId,
        parent_page_id: sharedPageId,
      });
      expect(moved.isError).toBe(false);
      expect(moved.data.page.parentPageId).toBe(sharedPageId);

      const children = await callTool(memberKey, 'list_child_pages', {
        page_id: sharedPageId,
      });
      expect(children.data.items.map((p: any) => p.id)).toContain(pageId);

      const dup = await callTool(memberKey, 'duplicate_page', {
        page_id: pageId,
      });
      expect(dup.isError).toBe(false);
      expect(dup.data.page.id).not.toBe(pageId);
    });

    it('comments in Markdown', async () => {
      const created = await callTool(memberKey, 'create_comment', {
        page_id: pageId,
        markdown: 'Un **commento**',
      });
      expect(created.isError).toBe(false);
      const updated = await callTool(memberKey, 'update_comment', {
        comment_id: created.data.id,
        markdown: 'Commento corretto',
      });
      expect(updated.isError).toBe(false);
      const list = await callTool(memberKey, 'get_comments', {
        page_id: pageId,
      });
      expect(list.data.items[0].content).toContain('Commento corretto');
    });
  });

  describe('write log and revocation', () => {
    it('logs write operations with the key and the user', async () => {
      const rows = await sql`
        select tool, success, user_id, api_key_id from idq_mcp_write_log
        where api_key_id = ${memberKeyId}`;
      const tools = rows.map((r) => r.tool);
      expect(tools).toContain('create_page');
      expect(tools).toContain('update_page');
      expect(rows.some((r) => r.success === false)).toBe(true);
      expect(rows.every((r) => r.user_id === memberId)).toBe(true);
    });

    it('a revoked key stops working immediately', async () => {
      expect((await mcp(memberKey, 'tools/list')).status).toBe(200);
      const res = await api(member, '/idq/api-keys/revoke', {
        id: memberKeyId,
      });
      expect(res.status).toBe(200);
      expect((await mcp(memberKey, 'tools/list')).status).toBe(401);
      const list = await api(member, '/idq/api-keys');
      expect(list.data.map((k: any) => k.id)).not.toContain(memberKeyId);
    });

    it('disabling MCP blocks every key', async () => {
      await api(admin, '/idq/settings/update', { idqMcpEnabled: false });
      expect((await mcp(adminKey, 'tools/list')).status).toBe(403);
    });
  });
});
