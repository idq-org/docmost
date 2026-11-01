# IDQ MCP

MCP server built into our Docmost instance, **compatible with clients of the Docmost MCP**: same address, same API key authentication, same tool names. It isn't an official Docmost feature: we wrote it from scratch ([issue #5](https://github.com/idq-org/docmost/issues/5)).

## How to use it

![The Settings → IDQ MCP page](images/idq-mcp-settings.png)

1. An admin turns it on in *Settings → IDQ MCP → Enable MCP*. While it's off, every call gets `403`.
2. Everyone creates their own key on the same page. The key is shown only once. It can expire after 30 days, 90 days or a year, or never. It can be revoked at any time, and from then on it stops working immediately.
3. Connect the assistant.

   Claude Code:

   ```sh
   claude mcp add idq --transport http https://app.informaticidiquartiere.org/mcp --header "Authorization: Bearer <key>"
   ```

   Claude Desktop, Cursor and the other clients that start a command:

   ```sh
   npx -y mcp-remote https://app.informaticidiquartiere.org/mcp --header "Authorization: Bearer <key>"
   ```

Every call acts as the user who created the key and never goes beyond their space and page permissions. Someone who can't see a space can't find or read its pages with any tool.

## Tools

| Area | Tools |
|---|---|
| Pages | `search_pages`, `get_page`, `create_page`, `update_page`, `list_pages`, `list_child_pages`, `duplicate_page`, `copy_page_to_space`, `move_page`, `move_page_to_space` |
| Spaces | `get_space`, `list_spaces`, `create_space`, `update_space` |
| Comments | `get_comments`, `create_comment`, `update_comment` |
| Other | `search_attachments`, `list_workspace_members`, `get_current_user` |

Page content goes in and out as Markdown: headings, lists, tables, code blocks and Mermaid diagrams (` ```mermaid ` blocks). Comments are Markdown too, but only with what the web app's comment editor can show: paragraphs, headings, lists, quotes, code blocks, links and text formatting. A comment with a table, a task list or an image is refused with an error, instead of showing up empty in the web app. The server itself describes the tool parameters: clients read them when they connect.

## Limits and log

- Rate limit: 120 requests per minute per key and 240 per user. Beyond that, the answer is `429` with `Retry-After`.
- Every write operation (successful or not) goes into the `idq_mcp_write_log` table, with user, key, tool and arguments. Long texts are shortened.
- The keys table holds only the hash: the clear-text key is never stored.
- When a member is deactivated or removed, their keys are revoked for good, as Docmost does with sessions: they don't come back if the member is reactivated. The keys stop working at once, and are marked revoked on their next use or within five minutes.
- Expired keys stay in the list, marked as expired, until they're revoked. They don't count toward the limit of 20 active keys per user.
- OAuth (claude.ai connectors, "read-only" access) will come in a second phase.

## How it's built

- Server: `apps/server/src/idq/`, registered in `app.module.ts` through `IdqModule`.
  - `mcp/` holds the `/mcp` endpoint (`@modelcontextprotocol/server` SDK, Streamable HTTP, for both 2025 and 2026 protocol clients).
  - `api-keys/` manages the keys.
  - `settings/` holds the admin switch.
  - `database/` holds the migrations.
- The tools call the core controllers (pages, spaces, comments, search), so they run exactly the same permission checks as the web app. The only tool with a query of our own is `search_attachments`: it filters on the space each page is in now, then applies the core page permissions.
- The IDQ migrations run at startup, after Docmost's, with their own tracking table (`idq_kysely_migration`). Migrations coming from upstream never end up in the middle of ours.
- Client: `apps/client/src/idq/mcp/`. The route is in `apps/client/src/idq/routes.tsx` and the menu item in `apps/client/src/idq/settings-nav.ts`. The Italian translations are in `apps/client/src/idq/mcp/i18n.ts`, not in `public/locales`, so they don't conflict with Docmost's updates.
- Three Docmost files change, each with one import and one `IDQ:` line (see [`idq-upstream-files.txt`](idq-upstream-files.txt)):
  - `app.module.ts` registers `IdqModule`;
  - `App.tsx` adds our routes;
  - `settings-sidebar.tsx` adds our menu items.

## Development

In development (`NODE_ENV` other than `production`) Docmost doesn't run its migrations at startup: run them by hand with `pnpm --filter server migration:latest`, then restart, and the IDQ migrations apply on their own. Docmost's `migration:down` and `migration:reset` don't know about our tables, which reference `users` and `workspaces`: to reset a development database, drop the `idq_*` tables first.

## Tests

The end-to-end test needs a running instance with an empty database, because it sets up the workspace itself:

```sh
cd apps/server
IDQ_E2E_URL=http://localhost:3000 \
IDQ_E2E_DATABASE_URL=postgresql://docmost:docmost@localhost:5432/docmost \
npx jest --config test/jest-e2e.json --runInBand idq-mcp
```

It creates an admin, a member who can write in a shared space, a member who can only read it, and a restricted space. Then it checks:

- that the member finds and reads nothing from the restricted space, with any of the 20 tools, including attachments whose stored space is stale;
- that the read-only member can't write anything in the shared space;
- that Markdown content (headings, lists, tables, Mermaid) is written and read back correctly, and that comments refuse what the web app can't show;
- that a revoked key stops working at once, and that deactivating a member revokes their keys even after reactivation;
- that blank key names are refused and expired keys don't count toward the limit.
