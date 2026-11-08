# IDQ members map

A map of Italy that shows where the members live, by province ([issue #4](https://github.com/idq-org/docmost/issues/4)). It is an IDQ feature written from scratch on Docmost's AGPL core.

The issue asked for the pixel-art style of the website prototypes (`idq-org/website`, branch `prototype/mappa-soci`); inside Docmost that style clashed with the rest of the app, so the map is a dot map in Docmost's own colours, for the light and the dark theme. The pixel-art style can come back on the website, if a public version is made (see [Open questions](#open-questions)).

## Where it is

- **Map**: *Members map* entry in the main sidebar, at `/map`. Italy is a grid of dots, one per pixel of the province grid: grey where there are no members, and in the primary colour, stronger with more members (1, 2 to 4, 5 or more), where there are some. Each province with members has a marker with their number; provinces whose markers would overlap share one marker, which lists them all (more of them on a small screen). Pointing at a province highlights it and shows its name and number of members; a marker opens a card with the names that members chose to show. Above the map: total members, provinces and regions, and where the current user is on the map.
- **List**: next to the map (under it on a phone), the same information by region and province, with the names. It is the accessible version of the map: the map itself is an image with a text summary for screen readers.
- **Profile**: *Settings › My profile › Members map*. Each member chooses:
  - *Don't show me* (the default): not on the map, and no province is stored;
  - *Count me, without my name*: only in the count of their province;
  - *Show my name*: in the count, with name and avatar;

  and the province, from the 107 in the ISTAT list (provinces, metropolitan cities and the like).

## Privacy

- Only the province: never a town or an address.
- Opt-in: nobody is on the map until they choose to be, in their profile, or until an admin puts them on the map with their consent (see [below](#putting-members-on-the-map-as-an-admin)). *Don't show me* deletes the row, so the province of someone who isn't on the map is never kept.
- Only for members logged in to the workspace, from an interactive session: the endpoints refuse requests without login, from public shares, IDQ API keys and OAuth tokens, and the page is inside the logged-in app.
- The map endpoint returns counts per province, and identities (id, name, avatar) only of who chose *Show my name*. The counts come from an aggregate query, so the identity of who is only counted never leaves the database.
- Admins don't see what members chose in their profile either: the management page only says that a member chose, without province or visibility. They see the provinces they set themselves, for members who gave their consent.
- Deactivated and deleted users are left out of the map. The province of deleted users is erased within an hour (`IdqMemberMapService.deleteLocationsOfDeletedUsers`); deactivated users keep it, and come back on the map if they are reactivated.
- Drawing the map makes no request to external services: the geography is in the bundle, and the map is drawn as SVG.

## API

All `POST`, with a session cookie:

| Path | Body | Returns |
|---|---|---|
| `/api/idq/member-map` | | `totals` (`members`, `provinces`, `regions`) and `provinces`: `code`, `members`, `named` (`id`, `name`, `avatarUrl`) |
| `/api/idq/member-map/me` | | `provinceCode` (or `null`), `visibility` and `setBy` (the admin who set it, or `null`) of the current user |
| `/api/idq/member-map/me/update` | `visibility`: `hidden`, `count` or `named`; `provinceCode` (e.g. `"BO"`), required unless `hidden` | the same as `/me` |
| `/api/idq/member-map/admin/members` | | admins only: every active member (`id`, `name`, `email`, `avatarUrl`), with `chosenBy` (`member`, `admin` or `null`); `provinceCode`, `visibility`, `setByName` and `updatedAt` only for what an admin set (`null` when the member chose) |
| `/api/idq/member-map/admin/update` | admins only: `members`, a list of `userId`, `visibility`, `provinceCode` | `updated`, and `skipped` with the reason (`chosen-by-member`, `not-a-member`) |

## Putting members on the map, as an admin

For members who already gave their consent (for example, the association asked everyone at a meeting), a workspace admin can put them on the map instead of waiting for each one to fill in their profile: *Manage* on the map page, at `/map/manage`.

- **Table of all the active members**, with province, visibility and who set them. Search by name or email, change the rows, then *Save*: changes are kept on the page until then. Choosing a province for a member who isn't on the map puts them on it without their name; change it to *With name* if they agreed to that.
- **What members chose in their profile is theirs**: admins see only that they chose, can't change it, and the server checks it again when saving, so a member who chooses in the meantime keeps their choice. When a member changes a province an admin set, it becomes their own choice.
- **Members see it**: the profile and the map page say which admin put them on the map, and they can change or remove it.
- **Import from a file**: a CSV (from Excel: *Save as › CSV UTF-8*, commas or semicolons) with a header row and the columns `email`, `provincia` (abbreviation or name, e.g. `BO`, `Bologna`, `Forlì-Cesena`, `Reggio Emilia`) and, optionally, `visibilità` (`con nome` / `senza nome`; rows without it take the choice made in the dialog). The file is read in the browser: other columns, such as addresses, never leave the admin's computer, and only the matched members, with province and visibility, reach the server when the table is saved. The dialog lists the rows it leaves out, and why: no Docmost account with that email, unknown province, the member already chose, email repeated.

Keep a record of the consent (who, when, with or without the name) in the association's private space, never in this repository.

## Geography

The provinces come from ISTAT, *Confini delle unità amministrative a fini statistici* on 1 January 2025 (generalized version, CC BY 4.0). The map page credits the source. A province is identified by its abbreviation (*sigla automobilistica*, e.g. `BO`).

`apps/client/src/idq/member-map/geo/build-italy-grid.mjs` rasterizes the boundaries on a grid of 77 × 90 pixels, 0.12° of latitude per pixel (the frame of the website prototypes) and writes:

- `apps/client/src/idq/member-map/geo/italy-grid.json`: regions, provinces with the position of their marker, and the grid, one province code per pixel;
- `apps/server/src/idq/member-map/idq-provinces.ts`: regions and provinces, to validate codes and count regions.

To regenerate them, for example when ISTAT changes the provinces:

```sh
curl -LO https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2025/Limiti01012025_g.zip
unzip Limiti01012025_g.zip -d istat
node apps/client/src/idq/member-map/geo/build-italy-grid.mjs istat
```

The script has no dependencies. If a province code disappears, the members who chose it drop off the map (the endpoint ignores unknown codes) until they choose again, or until a migration moves them to the new code.

## Code

- Server: `apps/server/src/idq/member-map/`. Table `idq_member_locations` (`user_id`, `workspace_id`, `province_code`, `visibility`, `set_by_id`: the admin who set it, `null` if the member chose), one row per member on the map.
- Client: `apps/client/src/idq/member-map/`, with the geography in `geo/`. Docmost files only get hook lines: `global-sidebar.tsx` (sidebar entry, from `apps/client/src/idq/global-nav.ts`) and `account-settings.tsx` (profile section, from `apps/client/src/idq/profile-sections.tsx`); the routes `/map` and `/map/manage` are in `apps/client/src/idq/routes.tsx`.
- Look: only Docmost's Mantine theme (colour variables for both themes, `light-dark()`), no fonts or images of its own.
- Management page: `apps/client/src/idq/member-map/pages/idq-member-map-admin-page.tsx`, with the CSV import in `apps/client/src/idq/member-map/admin/`.
- Tests: `apps/server/src/idq/member-map/*.spec.ts` (counts, validation, and that the server and client province lists match), `apps/client/src/idq/member-map/map-geometry.test.ts` (map layers, colour levels and markers), `apps/client/src/idq/member-map/admin/csv-import.test.ts` (reading the CSV, provinces, which rows are filled in), and `apps/server/test/idq-member-map.e2e-spec.ts`, which runs against an instance with an empty database (see the top of the file).

## Open questions

From the issue, not decided yet:

- Should founders look different on the map?
- Should there be a public version, with counts only, for the website? The server already computes counts without names, so it would be a separate endpoint that returns `totals` and `provinces` without `named`.
