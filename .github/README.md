# Docmost — Informatici di Quartiere fork

Fork of [docmost/docmost](https://github.com/docmost/docmost) that IDQ uses for the association's knowledge base, which agents can also read over MCP (see [MCP.md](MCP.md)), with a task board for each space (see [TASKS.md](TASKS.md)). The project's original README is [`README.md`](../README.md).

## Branches

| Branch | Contents | Rules |
|---|---|---|
| `idq` (default) | Docmost plus our changes; deploys run from this branch | changes go in through PRs |
| `main` | exact copy of `docmost/docmost@main` | never commit to it by hand: the action updates it |

Neither branch can be deleted or force-pushed.

## Updates from Docmost

The [`Sync upstream`](workflows/sync-upstream.yml) action runs every night, or by hand from *Actions → Sync upstream → Run workflow*:

1. it brings `main` up to date with `docmost/docmost`;
2. if `main` has commits that `idq` doesn't, it opens a `main → idq` PR (one at a time).

Merge that PR with a **merge commit**: squash and rebase are disabled in the repo, so the history stays shared with upstream and later updates stay simple. Don't delete `main` after the merge.

If the PR has conflicts, resolve them locally:

```sh
git checkout idq && git pull
git fetch origin
git merge origin/main      # or a specific release, e.g. git merge v0.98.0
# resolve the conflicts, then:
git push
```

Conflicts can only happen in the Docmost files we modify, which are all listed in [`idq-upstream-files.txt`](idq-upstream-files.txt). When resolving them:

- with `git config rerere.enabled true` (see [Local development](#local-development)) Git remembers how you resolved a conflict and reapplies it when the same conflict comes back;
- `git grep -n "IDQ:"` lists our hook lines in Docmost files;
- don't merge `pnpm-lock.yaml` by hand: take Docmost's version and regenerate it with `git checkout --theirs pnpm-lock.yaml && pnpm install --lockfile-only && git add pnpm-lock.yaml`.

### The `SYNC_TOKEN` secret

The action uses the `SYNC_TOKEN` repository secret: a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with resource owner `idq-org`, access to `idq-org/docmost` only, and these repository permissions set to *Read and write*: **Contents**, **Pull requests**, **Workflows**. Store it in *Settings → Secrets and variables → Actions*, and set a calendar reminder for its expiry date.

Without the secret the action falls back to the default `GITHUB_TOKEN`, which has two limits:

- GitHub never lets it update files in `.github/workflows`, so the sync fails whenever Docmost changes its own workflows (the error mentions `workflows` permission);
- the PRs it opens don't trigger CI, so the action starts CI on the PR by hand.

If the sync fails anyway (missing or expired token), update `main` with your own account (it needs the `workflow` scope in `gh`), then rerun the action so it opens the PR:

```sh
gh repo sync idq-org/docmost --branch main
```

## CI and deploy

Docmost runs at https://app.informaticidiquartiere.org, on the Hostinger VPS, in `/srv/docmost` (compose, `.env` with the secrets, nightly database backups in `backups/`).

- [`CI`](workflows/idq-ci.yml) runs on every PR to `idq`, on the PR merge result (`idq` with the PR merged in):
  - `docker-build` builds the Docker image. It is required to merge. For Sync upstream PRs opened without `SYNC_TOKEN`, Sync upstream starts it itself (or by hand: *Actions → CI → Run workflow* with the PR number).
  - `upstream-files` fails if the PR modifies a Docmost file that isn't listed in [`idq-upstream-files.txt`](idq-upstream-files.txt) (see [Keeping upstream merges easy](#keeping-upstream-merges-easy)).
- [`Deploy`](workflows/idq-deploy.yml) runs on every push to `idq` (that is, on every merge), except when only files in `.github/` change, and runs `/srv/docmost/deploy.sh` on the VPS: it brings the code to `origin/idq` and rebuilds the containers. It can be rerun by hand from *Actions → Deploy → Run workflow*.

Never edit `/srv/docmost/src` by hand on the VPS: every deploy resets it to `origin/idq`.

## Local development

```sh
git clone https://github.com/idq-org/docmost.git && cd docmost
git remote add upstream https://github.com/docmost/docmost.git
git remote set-url --push upstream DISABLE   # no accidental pushes to upstream
gh repo set-default idq-org/docmost          # gh PRs go here, not to docmost/docmost
git config rerere.enabled true               # reuse conflict resolutions across upstream merges
```

The `apps/server/src/ee` submodule points to Docmost's Enterprise edition, which is private: it isn't needed and must not be initialized.

## Rules for changes

- Everything in the repo is in English: code, comments, Markdown files, commit messages and PRs. UI text is written in English in the code, as in Docmost, and its Italian translation lives in our own translation files.
- Follow [Keeping upstream merges easy](#keeping-upstream-merges-easy).
- No credentials or association data in the repo: the fork is public (AGPL-3.0 license).
- PRs go to `idq` in this repo, never to `docmost/docmost`.
- Everything respects Docmost's space permissions: every feature has a test with a user who can't see a restricted space.
- Before starting a feature, comment on its issue, so that two people don't work on the same thing.

## Keeping upstream merges easy

Git only reports a conflict when Docmost and we change the same lines. New files never conflict, so the goal is to touch as few Docmost files as possible, with as few lines as possible.

- **Our code lives in our own folders.** Server: `apps/server/src/idq/`, one subfolder per feature, all registered in `IdqModule`. Client: `apps/client/src/idq/`, one subfolder per feature. Tests: `apps/server/test/idq-*`. Fork docs and workflows: `.github/`.
- **One hook line per extension point.** When a Docmost file has to know about our code, it gets one import and one line, marked with an `IDQ:` comment, and the actual list of modules, routes or menu items lives in our files. For example `app.module.ts` imports only `IdqModule`, and each server feature registers inside it. Likewise the client router and the settings menu each get a single line that spreads our own list of routes or items, so a new feature only adds to our files.
- **Leave the code around a hook as it is.** No reformatting, reordering or drive-by fixes in Docmost files: every changed line is a possible conflict.
- **Database: only our own tables.** Tables are prefixed `idq_`. Migrations live in `apps/server/src/idq/database/migrations` with their own tracking table, so they never interleave with Docmost's. Never add columns to Docmost tables: extra data goes in an `idq_` table that references the Docmost row (for example by `user_id` or `page_id`).
- **Translations in our own files**, not in `apps/client/public/locales`, which Docmost updates often.
- **Dependencies**: use what Docmost already depends on when you can. A new dependency changes `package.json` and `pnpm-lock.yaml`. Resolve lockfile conflicts by regenerating the file, as described in [Updates from Docmost](#updates-from-docmost).
- **Every Docmost file we modify is listed** in [`idq-upstream-files.txt`](idq-upstream-files.txt), with the reason. The `upstream-files` CI check fails when a PR modifies a Docmost file that isn't listed, so each new one is a deliberate choice that shows up in review. When we stop modifying a file, remove it from the list.

## Licenses

Two licenses coexist in the repo, and both must be respected.

### Enterprise code: not used

These folders are under the *Docmost Enterprise License*:
- `apps/server/src/ee` (private submodule, not initialized);
- `apps/client/src/ee`;
- `packages/ee`;
- `packages/base-formula`.

That code can be used in production only with a subscription, and modifications to it also belong to Docmost. Therefore:

- don't open, copy, adapt or import anything from those folders. Whoever builds a feature similar to one of the paid editions (kanban, API keys, OAuth, MCP) writes it from scratch, without looking at that code;
- don't create files under `ee/` paths and don't replace Enterprise modules;
- don't touch license checks (`LicenseCheckService`, `hasFeature`, feature flags) or settings tied to the paid editions (for example `mcpEnabled`), and don't unlock any paid feature;
- our image is built from the same code as the official Community images: the client's Enterprise code is there, but it stays off without a license, as in those images, and must never be enabled or modified.

### AGPL-3.0 core: used and modified, with its obligations

- Our code is under AGPL-3.0, like the repo.
- Keep the license files and copyright notices of Docmost and of the libraries.
- As soon as the app running on the VPS is modified, its interface must offer users a link to the source code (AGPL section 13): see issue [#8](https://github.com/idq-org/docmost/issues/8).

### Trademark and sources

- "Docmost" is a trademark of Docmost, Inc. Our additions are named as IDQ features (for example "IDQ MCP") and are not presented as official Docmost features. Don't use their logo for our features, and use the name only descriptively (for example "compatible with…").
- For compatibility, use only Docmost's public documentation.
- Third-party libraries and services must have compatible licenses (MIT, Apache-2.0…), and their notices are kept.

Every PR that adds features states in its description that it complies with this section. Review checks that it doesn't touch `ee/` paths or license checks.

## Planned features

Issues labelled [`idq`](https://github.com/idq-org/docmost/issues?q=is%3Aopen+label%3Aidq), in the proposed order. Several issues can be worked on in parallel, if there are people to work on them.

1. [#8](https://github.com/idq-org/docmost/issues/8): link to the source code in the interface, before or together with the first feature
2. [#5](https://github.com/idq-org/docmost/issues/5): built-in MCP, compatible with clients of the Docmost MCP (API keys first, then `/mcp`, then OAuth)
3. [#3](https://github.com/idq-org/docmost/issues/3): kanban board for tasks, with linked materials
4. [#12](https://github.com/idq-org/docmost/issues/12): deadlines and reminders on tasks and pages (can be done in parallel with #3)
5. [#4](https://github.com/idq-org/docmost/issues/4): members map in pixel art
