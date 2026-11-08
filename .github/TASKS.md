# IDQ task board

A simple kanban board for each space ([issue #3](https://github.com/idq-org/docmost/issues/3)), written from scratch on Docmost's AGPL core: pages, labels and space permissions. It is an IDQ feature, not Docmost's *Bases*.

## Where it is

- **Board**: *Board* entry in the space sidebar, at `/s/<space>/board`. One column per status, one card per task: drag a card, or use its menu, to change its status.
- **Task panel**: under the title of a task page. It shows status, priority, areas, people in charge, next deadline and linked materials. Writers change the status from its badge, and priority, areas and people in charge from the pencil button.
- **Used in tasks**: under the title of a page that a task links to.
- **Board settings**: for workspace admins, from the board. *Labels* sets the label vocabulary; *People in charge* says which member each person-in-charge label stands for.

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

*New task* in a column creates the page under the page that holds most tasks of the space (an index page, for instance), or at the root. The page starts with a table for what labels can't hold (deadline, dependencies), then goal, steps (a checklist) and references, in the writer's language.

## Permissions

- Space readers see the board and the panels; writers and admins also move cards, edit fields, create tasks and link materials. Page-level restrictions apply as in the rest of Docmost.
- Linked pages and files keep their own permissions: a viewer only sees, and counts, the ones they can open. The pickers only offer values from pages the user can open.
- Board settings and people in charge are for workspace admins.

## Linked materials

Stored in `idq_task_links`: pages (of any space), files (uploaded to the task page or already in Docmost) and external `http(s)` links. Links written in the text of a page aren't linked materials; to bring existing ones to the board, call `POST /api/idq/tasks/links/add` with `taskPageId`, `type: "page"` and `targetPageId` (id or slug id).

## For other IDQ features

- **Deadlines** ([issue #12](https://github.com/idq-org/docmost/issues/12)): the board doesn't read deadlines itself. The deadlines feature provides `IDQ_TASK_DEADLINE_SOURCE` (`apps/server/src/idq/tasks/idq-task-deadlines.ts`) in `IdqModule`; until then cards show no deadline, and a failing source never breaks the board.
- **Event** `idq.task.status-changed` (`IdqTaskStatusChangedEvent`): emitted when a task is created or changes column through the board or the panel, e.g. to close the deadlines of a task moved to *Done*. Status labels edited in Docmost's labels section are not reported.

## Code

- Server: `apps/server/src/idq/tasks/`. Only `idq-task-fields.ts` and `idq-task-label-store.ts` know the label format, so the fields can move to a table of their own later. Permissions, label writes (Docmost's `LabelService`) and page creation (Docmost's page controller) go through `apps/server/src/idq/core/`.
- Tables: `idq_task_settings` (vocabulary), `idq_task_links` (materials), `idq_task_assignees` (people in charge).
- Client: `apps/client/src/idq/tasks/`, using Docmost through `apps/client/src/idq/core/`. Docmost files only get hook lines: `App.tsx` (route), `space-sidebar.tsx` (sidebar entry), `full-editor.tsx` (panel under the title).
- Tests: `apps/server/src/idq/tasks/idq-task-fields.spec.ts`, and `apps/server/test/idq-tasks.e2e-spec.ts`, which runs against an instance with an empty database (see the top of the file).
