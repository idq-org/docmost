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

Every call acts as the user who created the key and never goes beyond their space and page permissions. Someone who can't see a space can't find or read its pages with any tool. A page they can't see gets exactly the same answer as a page that doesn't exist (`Not found: Page not found`), so the answer doesn't reveal that it exists.

## Tools

| Area | Tools |
|---|---|
| Pages | `search_pages`, `get_page`, `create_page`, `update_page`, `list_pages`, `list_child_pages`, `duplicate_page`, `copy_page_to_space`, `move_page`, `move_page_to_space` |
| Page history | `list_page_history`, `get_page_history` |
| Spaces | `get_space`, `list_spaces`, `create_space`, `update_space` |
| Comments | `get_comments`, `create_comment`, `update_comment` |
| Tasks | `list_tasks`, `get_task`, `get_task_options`, `get_task_settings`, `create_task`, `update_task`, `add_task_link`, `remove_task_link`, `list_assignee_mappings`, `set_assignee_mapping`, `update_task_settings` |
| Other | `search_attachments`, `list_workspace_members`, `get_current_user` |

Page content goes in and out as Markdown: headings, lists, tables, code blocks and Mermaid diagrams (` ```mermaid ` blocks). Comments are Markdown too, but only with what the web app's comment editor can show: paragraphs, headings, lists, quotes, code blocks, links and text formatting. A comment with a table, a task list or an image is refused with an error, instead of showing up empty in the web app. The server itself describes the tool parameters: clients read them when they connect.

The page history tools aren't part of the Docmost MCP. They read the versions that Docmost saves for the history panel of the web app, with the same permissions. `list_page_history` lists the versions of a page, newest first, with date, title, author and contributors; it takes `limit` and `cursor` like `list_pages`. `get_page_history` returns one version with its title and its content as Markdown, in the same format as `get_page`. Docmost saves a version once a page has been quiet for `PAGE_HISTORY_INTERVAL` (5 minutes by default, 1 minute for a page created less than 5 minutes ago): an edit made with `update_page` is saved like an edit in the editor, so it shows up after that delay. There is no restore tool: to bring a version back, read it with `get_page_history` and write its content with `update_page`.

The task tools aren't part of the Docmost MCP: they give access to the [IDQ task board](TASKS.md), with the same permissions as the web app. `list_tasks` takes the filters of the board (priority, area, person in charge, *My tasks*); a filter takes a value or a name, and a person in charge also matches the other values that stand for the same member. The last three tools are for workspace admins.

## Limits and log

- Rate limit: 120 requests per minute per key and 240 per user. Beyond that, the answer is `429` with `Retry-After`.
- A key works only for the workspace it was created in, until it expires or is revoked; anything else gets `401`.
- Each request is answered on its own: the server keeps no sessions and opens no `subscriptions/listen` streams.
- Every write operation (successful or not) goes into the `idq_mcp_write_log` table, with user, key, tool and arguments, stored as a JSON object (long texts are shortened). Read it with SQL, e.g. `select created_at, tool, success, arguments from idq_mcp_write_log order by created_at desc`.
- The keys table holds only the hash: the clear-text key is never stored.
- When a member is deactivated or removed, their keys are revoked for good, as Docmost does with sessions: they don't come back if the member is reactivated. The keys stop working at once, and are marked revoked on their next use or within five minutes. That five-minute sweep needs the scheduler that Docmost registers in `TelemetryModule`; if it's missing, the server logs an error at startup (`IdqSchedulerCheck`).
- Expired keys stay in the list, marked as expired, until they're revoked. They don't count toward the limit of 20 active keys per user, which also holds when keys are created at the same time.
- OAuth (claude.ai connectors, "read-only" access) will come in a second phase.

## How it's built

- Server: `apps/server/src/idq/`, registered in `app.module.ts` through `IdqModule`.
  - `mcp/` holds the `/mcp` endpoint (`@modelcontextprotocol/server` SDK, Streamable HTTP, for both 2025 and 2026 protocol clients).
  - `api-keys/` manages the keys.
  - `settings/` holds the admin switch.
  - `database/` holds the migrations.
  - `core/` gives access to Docmost's controllers and permission checks, shared with the other IDQ features.
- The page, space, comment and search tools call the core controllers, so they run exactly the same permission checks as the web app. Among them, the only tool with a query of our own is `search_attachments`: it filters on the space each page is in now, then applies the core page permissions.
- A tool that takes a page id or slug id first looks the page up with `IdqPageAccess.findViewablePage` (`core/`, shared with the task board): a page that is missing, deleted, in another workspace or hidden from the user always gets the same not-found answer.
- The page history tools (`mcp/tools/page-history-tools.ts`) call the history methods of the core page controller (`/pages/history` and `/pages/history/info`), and convert the content with the same function as `get_page`. A version id passed with a page it doesn't belong to is answered as not found.
- The task tools (`mcp/tools/task-tools.ts`) call the IDQ task services behind the endpoints of `IdqTasksController`, with the same DTOs, so they run the same checks as the board. Those services have their own label and link queries (`apps/server/src/idq/tasks/`), filtered by space membership and by the core page permissions.
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

- that the member finds and reads nothing from the restricted space with the read tools, writes nothing in it with the write tools, and doesn't see it through attachments whose stored space is stale or through tasks linked from a task they can see;
- that every tool that takes a page answers a hidden page, by id or slug id, exactly like a missing one;
- that the read-only member can't write anything in the shared space;
- that a writer creates tasks, changes their fields and links materials, and that only workspace admins change people in charge and the label vocabulary;
- that Markdown content (headings, lists, tables, Mermaid) is written and read back correctly, and that comments refuse what the web app can't show;
- that an edit made with `update_page` shows up in `list_page_history` with the right author once Docmost saves the version (the test waits for it, about a minute), that versions come newest first page by page, and that no version of the restricted space can be listed or read, not even through a page the member can see;
- that a revoked key stops working at once, that an expired key stops working, and that deactivating a member revokes their keys even after reactivation;
- that blank key names are refused, that expired keys don't count toward the limit, and that 25 keys created at the same time stop at the limit of 20.

The unit tests (`cd apps/server && npx jest src/idq`) cover the rest of the authentication path without an instance: a key of another workspace or a request without a workspace is refused, the rate limit answers `429` with `Retry-After` per key and per user, the raw key isn't handed to the MCP SDK, and the startup check reports missing sweeps.
