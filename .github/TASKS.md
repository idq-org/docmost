# IDQ task board

A simple kanban board for each space ([issue #3](https://github.com/idq-org/docmost/issues/3)), written from scratch on Docmost's AGPL core: pages, labels and space permissions. It is an IDQ feature, not Docmost's *Bases*.

## Where it is

- **Board**: *Board* entry in the space sidebar, at `/s/<space>/board`. One column per status, one card per task: drag a card, or use its menu, to change its status.
- **Task panel**: under the title of a task page. It shows status, priority, areas, people in charge, next deadline and linked materials. Writers change the status from its badge, and priority, areas and people in charge from the pencil button.
- **Used in tasks**: under the title of a page that a task links to.
- **Board settings**: for workspace admins, from the board. *Labels* sets the label vocabulary; *People in charge* says which member each person-in-charge label stands for, choosing among all the members of the workspace (shown with their email, to tell apart people with the same name).

## A task is a page with labels

A page is a task when it has a status label. Priority, areas and people in charge are labels too, so they keep working in Docmost's own label pages, and existing pages become tasks by adding a label.

Each workspace chooses its words: a prefix per field, the values of each column and the priorities. The defaults are:

| Field | Prefix | Values |
|---|---|---|
| Status | `status-` | `todo`, `in-progress`, `to-decide`, `waiting`, `blocked`, `to-review`, `done` |
| Priority | `priority-` | `highest`, `high`, `medium`, `low` (most urgent first: the board orders and colors by this list) |
| Area | `area-` | any value |
| Person in charge | `assignee-` | any value; several are allowed |

- A column can have more than one value (synonyms, or the old words after a change): the first is written when a card moves, the others are read too.
- Changing the vocabulary doesn't rename the labels already on pages. Labels with words outside the vocabulary are ignored; a status value outside it shows up in an *Other status* column, and moving the card from there writes a known value.
- The labels are the source of truth: moving a card or saving the panel replaces the page's labels. Nothing is written in the page content.
- Who a person-in-charge value stands for: the member an admin chose, or else the member whose full name (`assignee-mario-rossi`), first name if no one else has it (`assignee-mario`), or email before the @ matches the value. A matched person gets their avatar and counts for *My tasks*; any other value is shown as a name, for people without an account.

## New tasks

*New task* in a column creates the page under the page that holds most tasks of the space (an index page, for instance; on a tie, the one with the newest task), or at the root when most tasks are there or the writer can't create pages under that one. The page starts with a table for what labels can't hold (deadline, dependencies), then goal, steps (a checklist) and references, in the writer's language (English or Italian). The server writes these sections (`idq-task-template.ts`) whenever a task is created without content or with empty content, from the board or from MCP. If the status label can't be written, the new page is deleted again (for good, not to the trash), so a retry doesn't leave a duplicate.

## Permissions

- Space readers see the board and the panels; writers and admins also move cards, edit fields, create tasks and link materials. Page-level restrictions apply as in the rest of Docmost.
- Linked pages and files keep their own permissions: a viewer only sees, and counts, the ones they can open. The pickers only offer values from pages of the space that the user can open.
- Board settings and people in charge are for workspace admins. Only they get members' emails (`POST /api/idq/tasks/assignees/members`, for the *People in charge* picker); other users only see names, and the label value of a member, which can be the part of their email before the @.

## Linked materials

Stored in `idq_task_links`: pages (of any space), files (uploaded to the task page or already in Docmost) and external `http(s)` links, at most 100 per task. A page or file is linked to a task once: linking it again returns the existing link, even at the limit. Links written in the text of a page aren't linked materials; to bring existing ones to the board, call `POST /api/idq/tasks/links/add` with `taskPageId`, `type: "page"` and `targetPageId` (id or slug id).

## From MCP

The [IDQ MCP](MCP.md) has one tool for each operation of the board, with the same permissions:

| Tool | What it does |
|---|---|
| `list_tasks` | the board of a space, with the filters of the web board, by value or by name |
| `get_task` | fields, linked materials and "used in" of a page |
| `get_task_options` | values in use in the space, and the members with the value that stands for each |
| `create_task`, `update_task` | new task in a column; status, priority, areas and people in charge, in one write |
| `add_task_link`, `remove_task_link` | linked materials |
| `get_task_settings`, `update_task_settings` | label vocabulary (changing it is for workspace admins) |
| `list_assignee_mappings`, `set_assignee_mapping` | who a person-in-charge value stands for (workspace admins) |

A new task gets the same starting table and sections as on the board, unless the tool passes its own Markdown.

## For other IDQ features

- **Deadlines** ([issue #12](https://github.com/idq-org/docmost/issues/12)): the board doesn't read deadlines itself. The deadlines feature provides `IDQ_TASK_DEADLINE_SOURCE` (`apps/server/src/idq/tasks/idq-task-deadlines.ts`) in `IdqModule`; until then cards show no deadline, and a failing source never breaks the board.
- **Event** `idq.task.status-changed` (`IdqTaskStatusChangedEvent`): emitted by `IdqTaskBoardService` when a task is created or really changes column, from the board, the panel or the MCP task tools, e.g. to close the deadlines of a task moved to *Done*. `previousStatus` is the status that was replaced (read under the page lock), or null for a new task or a status outside the vocabulary; moving a task to the column it is already in emits nothing. Status labels edited in Docmost's labels section are not reported.

## Code

- Server: `apps/server/src/idq/tasks/`. Only `idq-task-fields.ts` and `idq-task-label-store.ts` know the label format, so the fields can move to a table of their own later. Permissions, label writes (Docmost's `LabelService`) and page creation (Docmost's page controller) go through `apps/server/src/idq/core/`.
- Single instance: label changes to the same page are serialized by a lock that lives in the server process (`IdqPageLock`), and `LabelService` writes added and removed labels in separate transactions (added first, so a task never loses its status). This is safe while the server runs as one instance, as it does; with more instances `IdqPageLock` is the place to switch to a shared lock. The limit of linked materials doesn't depend on it: it is checked in a transaction that locks the task page row.
- Tables: `idq_task_settings` (vocabulary), `idq_task_links` (materials), `idq_task_assignees` (people in charge).
- Client: `apps/client/src/idq/tasks/`, using Docmost through `apps/client/src/idq/core/`. Docmost files only get hook lines: `App.tsx` (route), `space-sidebar.tsx` (sidebar entry), `full-editor.tsx` (panel under the title).
- Tests: `apps/server/src/idq/tasks/idq-task-fields.spec.ts` (labels), `idq-task-board.service.spec.ts` (status events, new tasks), and `apps/server/test/idq-tasks.e2e-spec.ts`, which runs against an instance with an empty database (see the top of the file). The MCP tools are tested in `apps/server/test/idq-mcp.e2e-spec.ts`.
