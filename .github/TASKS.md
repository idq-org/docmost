# IDQ task board

A simple kanban board for each space ([issue #3](https://github.com/idq-org/docmost/issues/3)), written from scratch on Docmost's AGPL core: pages, labels and space permissions. It is an IDQ feature, not Docmost's *Bases*.

## Where it is

- **Board**: *Board* entry in the space sidebar, at `/s/<space>/board`. One column per status, one card per task.
- **Task panel**: under the title of a task page, with status, priority, area, people in charge, next deadline and linked materials. Writers change the status from its badge, and priority, area and people in charge from the pencil button.
- **Used in tasks**: under the title of a page that a task links to.

## A task is a page with labels

A page is a task when it has a `stato-` label. The other fields are labels too, so existing tasks show up without changes and the labels keep working in Docmost's own label pages.

| Label | Field | Values |
|---|---|---|
| `stato-…` | column | `da-fare`, `in-corso`, `da-decidere`, `in-attesa`, `bloccata` (or `bloccato`), `da-verificare`, `fatto` (or `fatta`) |
| `priorita-…` | priority | `massima`, `alta`, `media`, `bassa` get a color and come first in that order; other values are shown as they are |
| `area-…` | area | any value |
| `ref-…` | person in charge | any value; several are allowed |

- A `stato-` value not in the list shows up in an extra *Other status* column; moving the card from there sets a known status.
- Who a `ref-` value stands for: workspace admins choose it from *People in charge* on the board (table `idq_task_assignees`), which is needed when a first name belongs to several members (`ref-andrea`) or an account has another name. Without a choice the value is matched by full name (`ref-mario-rossi`), by first name if no one else has it (`ref-mario`), or by the part of the email before the @. A matched person gets their avatar and counts for *My tasks*; any other value is shown as a name, for people without an account.
- The labels are the source of truth: moving a card or saving the panel replaces the page's labels. Status, priority, area and people in charge are no longer written in the table at the top of the task page, which keeps only *Scadenza* and *Dipende da*.

## New tasks

*New task* in a column creates the page under the page that holds most tasks of the space (the index page *Task soci* or *Task direttivo*), or at the root, with the sections of the association's task pages: the table with *Scadenza* and *Dipende da*, *Obiettivo*, *Passi* (a checklist) and *Riferimenti*. The section names come from the translation files, in the writer's language.

## Permissions

- Space readers see the board and the panels; writers and admins also move cards, create tasks and link materials. Page-level restrictions apply as in the rest of Docmost.
- Linked pages and files keep their own permissions: a viewer only sees, and counts, the ones they can open.

## Linked materials

Stored in `idq_task_links`: pages (of any space), files (uploaded to the task page or already in Docmost) and external `http(s)` links. Links written in the text of a page (for example in *Riferimenti*) aren't linked materials: to bring existing ones to the board, call `POST /api/idq/tasks/links/add` with `taskPageId`, `type: "page"` and `targetPageId` (id or slug id of the page).

## Deadlines

The card shows the next open deadline from `idq_deadlines` ([issue #12](https://github.com/idq-org/docmost/issues/12)) as soon as that table exists. When a task changes column the server emits `idq.task.status-changed`, so the deadlines feature can close the open deadlines of a task moved to *Done*.

## Code

- Server: `apps/server/src/idq/tasks/`. The label format is only known by `idq-task-fields.ts` and `idq-task-label-store.ts`, so the fields can move to a table of their own later.
- Client: `apps/client/src/idq/tasks/`.
- Tests: `apps/server/src/idq/tasks/idq-task-fields.spec.ts` and `apps/server/test/idq-tasks.e2e-spec.ts` (run against an instance with an empty database, see the top of the file).
