# CLAUDE.md

Crociata Nera: website of the Clash of Clans clan #2J8JVVCLC (https://crociatanera.it). Wars, CWL,
Raid Weekend, players, statistics and commendations, plus user accounts linked to game accounts.

Talk to the user in **Italian**. Code, identifiers, comments, tests and i18n keys are in **English**;
Italian only in the UI translations (`public/i18n/it-IT.json`).

## Repository

| Folder | What | Stack |
|---|---|---|
| `src/` | Frontend | Angular 22 (standalone, zoneless, signals, `rxResource`), Angular Material, ngx-translate, Chart.js |
| `backend/` | Application backend: every datum of the site (auth, Clash of Clans data read live or saved: wars/CWL/raids, players, commendations), scheduler | Next.js 16 route handlers, Mongoose 9, zod 4 |
| `deploy/` | Production: docker compose + Caddy on the VPS, `deploy.sh`, `backup.sh` | |

Request routing (same in dev via `proxy.conf.json` and in prod via `deploy/Caddyfile`):
`/api/v1/*` → backend (`:3001`). The old Clash of Clans proxy (`server/`, `/api/coc`) is retired: Caddy answers
410 there; its archive volume `proxy_data` is kept on the VPS (and backed up) until imported or discarded.

## Commands

```sh
npm start                 # frontend on :4200 (needs the backend for real data)
npm run start:mock        # frontend with mock data, no backend needed (no signed-in user)
npm run start:prod        # builds, then serves dist/ like Caddy on :4400 to test the service worker (not
                          # `ng serve`: its files fail the worker's hash check). Own port: the worker stays
                          # registered. Needs http://localhost:4400 in FRONTEND_URL of backend/.env.local
npm run backend           # backend on :3001 (reads backend/.env.local)

npx ng test --watch=false                          # frontend tests (Vitest)
npx ng test --watch=false --include <spec path>    # a single spec
npx tsc -p tsconfig.app.json --noEmit              # frontend type check
npm run lint:colors                                # colours only from the palette
npm run lint:units                                 # sizes in rem, no hard-coded pixels
npm run medals                                     # re-render the still 3D medals (public/commendations/3d/)
npm run medals:check                               # fail when they are out of date (in CI)
cd backend && npm run typecheck && npm test        # backend type check + tests (Vitest, in-memory MongoDB)

npm run typecheck:e2e                              # e2e type check (tests, support, stack scripts)
npm run e2e:build && npm run test:e2e              # end-to-end (Playwright) on an isolated stack: production
                                                   # builds, MongoDB in memory, fake CoC API, SMTP sink, no
                                                   # outbound network (e2e/README.md)
npm run test:e2e:cross                             # the @cross journeys on Firefox and WebKit (local only)
```

CI (`.github/workflows/deploy.yml`) runs all of the above but `test:e2e:cross` (end-to-end: Chromium desktop
and phone, job `E2E`) on every pull request and every push to `master`; a push to `master` that passes is **deployed automatically** to the VPS (`deploy/deploy.sh <tested sha>`), which
restarts the backend and rolls back to the previous images if the containers do not become healthy (manual:
`deploy/rollback.sh`).

`master` is protected (GitHub ruleset "Protect master", no bypass): no direct or force push, changes arrive
only through a pull request whose `Frontend` and `Backend` checks pass on a branch up to date with `master`
(no approvals needed). Work on `develop`, then `gh pr create --base master`, `gh pr checks --watch`,
`gh pr update-branch` if `master` moved, and `gh pr merge --merge` **only when the user asks** (the merge
deploys to production).

Dependabot (`.github/dependabot.yml`) opens PRs against `master` every Monday: **minor and patch only**,
one grouped PR per ecosystem and folder (npm `/` and `/backend`, Docker images of `deploy/`, compose images,
GitHub Actions). Major versions are ignored: upgrade them by hand on `develop`, with the code changes they
need. Security updates are on too (PRs as soon as an advisory is published, outside the schedule). Same
rules as any PR: merge only when the user asks, after the checks pass. A Dependabot PR behind `master`:
comment `@dependabot rebase` (not `gh pr update-branch`, which stops its automatic rebases). Its base
cannot be moved to `develop`: a rebase resets it to `master`.

## Skills

Project procedures live in `.claude/skills/` (this file keeps the general rules; the skills the
step-by-step work). Load the matching one before starting:

| Task | Skill |
|---|---|
| New feature or extension, end to end | `crn-feature-development` |
| Something broken or wrong | `crn-bug-investigation` |
| Review a diff, branch or PR | `crn-code-review` |
| Which tests to write, how to run them | `crn-testing-strategy` |
| Add/change an `/api/v1` route | `crn-backend-endpoint` |
| Table filtered/sorted/paged by the backend | `crn-server-table` |
| Pages, components, styles, texts | `crn-frontend-ui` |
| Who may see/do what, security | `crn-access-control` |
| Models, indexes, migrations, data repairs | `crn-mongo-data` |
| CoC API reads, scheduler steps | `crn-game-data-sync` |
| Rankings, commendations, records, CWL selection score | `crn-clan-statistics` |
| Bases, proposals, base posts on Telegram | `crn-base-arsenal` |
| Telegram announcements | `crn-announcements` |
| PR to master, deploy, rollback, Dependabot | `crn-release` |
| Realign `dev` with `Prod` | `crn-copy-prod-to-dev` |

When a skill and the code disagree, the code wins: fix the skill in the same change.

## Conventions

- Every Angular component has separate `.ts` / `.html` / `.scss` files (no inline template/styles).
- Selector prefix `crn` (Crociata Nera): components `crn-xxx`, directives `[crnXxx]` (set in `angular.json`).
- Prettier: `printWidth` 100, single quotes, Angular parser for HTML. The user's editor formats on
  save, so diffs often contain formatting changes.
- Colours: the **only** place with colour literals is `src/styles/_color-palette.scss` (theme tokens
  per theme + identity tokens, grouped by meaning). Elsewhere use `var(--cn-*)`, and
  `@use 'color-palette' as palette;` + `palette.alpha(var(--cn-x), 30%)` for transparency; TS reads
  tokens with `cssColor()` (`src/app/shared/styles/css-color.ts`). `npm run lint:colors` (in CI) fails
  on any other literal.
- Sizes: rem only. Margins, paddings and gaps use `$space-xs|s|m|l|xl|xxl|xxxl`, corners
  `$radius-s|m|l|xl` from `src/styles/_variables.scss` (`@use 'variables' as *;`). Circles use
  `border-radius: 50%`, pills (wider than tall) `$radius-pill`. Negative tokens go in parentheses
  (`margin: 0 (-$space-s)`). Pixels only for hairlines (≤ 2px, border/outline widths);
  `npm run lint:units` (in CI) fails on any other px (`units-lint: allow` comment to opt out).
- New UI text: add the key to **all three** files `public/i18n/{it-IT,en-US,es-ES}.json`.
- Backend responses are `BaseResult` `{ result, messages, status }`; errors are `MessageKey` values
  (`ERROR.*` / `SUCCESS.*`) translated by the frontend. Validate input with zod (`parseBody`,
  `parseQuery`, `validate`); path params with `validate(z.object({...}), {...})`.
- Every backend route has a rate limit (`ApiName` + `RATE_LIMITS` in `backend/src/lib/http/api-name.ts`).
- Every backend route is documented in `backend/src/openapi/` (operations + response models as zod
  schemas), served as OpenAPI 3.1 at `GET /api/v1/openapi.json` and shown by Swagger UI at
  `/api/v1/docs`: public in dev; in production for administrators only (browser login dialog with
  their site username/email and password, HTTP Basic, or a Bearer token). Tests enforce it: a route
  without an entry fails `test/openapi.test.ts`, and every response received through `call()` must
  match its documented status, model (strict) and message keys (`test/contract.ts`).
- Tests: keep them green; add or update specs with every change. Backend tests call route handlers
  through `backend/test/helpers.ts` (`call(handler, { body, token, cookie, params, ip })`) and fake the
  CoC API with `mockCocApi` (`backend/test/coc-mock.ts`).
- Commit messages: `type(scope): :gitmoji: Description` in English (e.g.
  `feat(tables): :sparkles: ...`, `fix(raids): :bug: ...`), one commit per topic when asked.
  Commit or push only when the user asks.

## Frontend notes

- Tables: `<crn-table>` (`src/app/shared/components/table/`), a wrapper of `mat-table`: the page declares
  `matColumnDef`s (and optionally `matRowDef`, `*matFooterCellDef`, `matSort` on the element);
  the component never grows past the visible area (rows scroll inside), keeps caption, header,
  filter row and footer in place, is as tall as `visibleRows` rows (10 by default; fewer rows
  leave empty room above the footer), pages rows with `pageSize`, filters by column
  (`TableFilters`: text, number range, date range, yes/no, options) and makes columns resizable.
  Header labels never wrap. A page's styles cannot reach `<table>` itself: style rows and cells.
- Every data table is filtered, sorted and paged **by the backend**: the page creates a
  `serverTable({ params, load })` (`shared/components/table/server-table.ts`) and binds `[source]`; the table
  asks for a page at every change (text filters after a pause), keeps the last rows dimmed with a
  bar under the header while loading, a spinner when there are none yet, the error with "Retry".
  `params` (season, period…) go to the backend too; a change returns to page 1. Totals, footers and
  filter options come from the route's `summary`. Query string (`tableQueryParams`): `page`, `limit`
  (left out: every row), `sort`, `order`, text `col=`, number `colMin`/`colMax`, date
  `colFrom`/`colBefore`, yes/no `col=true`, options `col=a,b`. Backend side: `defineTable` +
  `parseTableQuery` + `queryTable` (`backend/src/lib/table/table-query.ts`, rows built in memory),
  documented with `tableQueryPart` (`src/openapi/table.ts`), rate limit `TABLES_READ`. Column ids
  and filters are shared in `shared/components/table/clan-tables.ts`, also used by the mock services
  (`applyTableQuery`). Only the CWL group standings (8 rows, no filters) take plain `[data]`.
- PDF export of a table: the page builds a `TablePdf` (`shared/pdf/table-pdf.ts`: columns, groups of
  rows with an accent and `pageBreakBefore`, image cells, facts, totals, a page of notes) from the data it
  already has and binds `<crn-pdf-button [pdf]="...">`; `TablePdfExporter` loads pdfmake (lazy chunk) and the
  fonts in `public/assets/fonts/pdf/` only at the first export, turns the pictures into PNG and draws names
  with emoji or other scripts as pictures (browser fonts); `buildTablePdf` draws the pages. Every PDF has
  the "iron" look of the site (`shared/pdf/iron-pdf.ts`: brushed iron from `PdfToolkit.ironPlate`, double gold
  frame with studs, same header and footer on every page, colours `--cn-pdf-*` read as `PdfTheme`). Pictures must be same-origin: league badges are copied in
  `public/game/league-tiers/` (`leagueTierImage`). Used by the CWL line-up, the Raid Weekend and the war report
  (`features/wars/war-report-pdf.ts`). `<crn-pdf-button>` downloads the PDF or its pages as JPEG pictures
  (`shared/pdf/pdf-pages.ts`: pdf.js, lazy chunk, worker copied to `assets/pdfjs/` by `angular.json`; several
  pages in one ZIP, `shared/pdf/zip.ts`, as a click starts one download only). Where the device shares files
  it adds "Share" with the same choice (Web Share API; a notice asks one more tap when the browser refuses a
  share started too long after the tap).
  The browser side (pdfmake, fonts, pictures, emoji texts, frame) is `PdfToolkit` (`shared/pdf/pdf-toolkit.ts`),
  shared with other documents: the bases PDF (`features/bases/pdf/`, editor `BasesPdfEditor`, for
  administrators only) has a cover (picture picked on the device, darkened on a canvas) and a page per base.
- 3D medals (`shared/medal-3d/`): lists show **pre-rendered stills** (`<crn-medal-3d-image>`,
  `public/commendations/3d/<emblem>[-locked].webp`, 256 px, `medalStillUrl`), drawn at build time by
  `npm run medals` with the site's own Three.js code in headless Chromium. Re-run it after changing medal
  SVGs, finishes, lights or 3D code: `medals:check` (CI) compares a fingerprint of the bundled 3D code, the
  SVGs and the medal colours (`scripts/medal-stills/manifest.json`). The dialog's `<crn-medal-3d-viewer
  [still]>` shows the still until the interactive medal has its relief, then fades to it.
- Share cards (`shared/share-card/`): `ShareCardRenderer` draws a PNG on a canvas in the same iron look
  (`paintIronPlate`, PDF fonts, 3D medal from `MedalSnapshots.still`), square 1080 or story 1080×1920. Used by
  "Share" in the commendation dialog, only for the signed-in user's own earned medals
  (`CommendationShareDialog`: Web Share API with caption, download, copy caption).
- Pages filling the viewport use `host: { class: 'page--fill' }` and a `.page__scroll` area with
  `crnScrollFade` (scrollbars are hidden site-wide; the fade bands hint at more content).
- Empty/loading/error states: `<crn-load-state>` (shows the clan badge in empty states, `ClanBadge`).
- Responsive layout by available width: prefer **container queries**. A container query never
  applies to the container itself, so put `container-type` on a parent. Mind rule order: base rules
  must come before the `@container` block (same specificity, later wins). Text that must fit its box
  uses `font-size: min(<normal size>, Ncqi)`; for names add a `max(<minimum>, ...)` so they wrap
  below it.
- Material tooltips set `touch-action: none`; a global rule in `styles.scss` restores scrolling.
- Signed-in user: `AuthService` (`accessToken` in memory, refresh cookie httpOnly). "Your" rows in
  tables: `isMine = inject(AuthService).isMyPlayer` and `[class.cn-row-me]="isMine(row.tag)"`.
  Offline (backend unreachable) the user of the last session is remembered from a minimal profile in
  localStorage (no token, no email; `isUnconfirmed()`), confirmed or signed out when the backend
  answers. Network state: `Connectivity` (`core/pwa/connectivity.ts`): offline banner in the shell,
  "offline" error messages, `<crn-load-state>` retries by itself when the connection comes back.
- Icons: `<crn-icon name="..." />` (`src/app/shared/components/icon/`) draws `public/assets/icons/<name>.svg`
  with `<use href="…#icon">` (no icon font); the files paint with `currentColor`, so set `color` to
  colour them. Precached by the service worker. Names are typed: add a new one to
  `scripts/generate-icons.mjs` and run `npm run icons` (writes the SVGs and `icon-names.ts`).
  Inside Material buttons add `matButtonIcon`, inside menu items `matMenuItemIcon` (projection slots).
- Service worker (production build only, `ngsw-config.json`): startup files (`index.html`, `main`,
  styles) precached, the other JS chunks (`app-code`) cached lazily — the chunks already loaded
  are stored when the worker takes control (`core/pwa/startup-scripts.ts`) — pictures cached
  on first use, the clan data (`clan-data` group, dropped at sign-out) network-first
  with the cache as offline fallback. A new deploy reaches open tabs through the "Update" prompt
  (`core/pwa/app-updates.ts`). A new private `/api/v1` GET must not join a cached data group
  unless it is cleared at sign-out too.
  Emergency switch in production: `deploy/service-worker.sh off` on the VPS (immediate, until the
  next deploy) or `SW_DISABLED=1` in `deploy/.env` (kept across deploys); see README.
- Content Security Policy (`deploy/Caddyfile`, Report-Only for now): the inline scripts of `src/index.html`
  and of the Swagger UI page (`backend/src/app/api/v1/docs/route.ts`) are allowed by sha256 hash: changing
  them (even whitespace) means updating the hash (README "Content Security Policy"). A new external host
  (images, fonts, scripts) must be added to the policy too.
- Check visual changes in a real browser before declaring them done (mock server
  `npm run start:mock` for public pages; pages needing a session cannot be seen in mock mode).

## Backend notes

- Linked game accounts: `User.playerTags` (verified with the in-game API token through
  `POST /players/{tag}/verifytoken`, max 10, unique across users) and `pendingPlayerTag` (old
  unverified link). Administrators can only unlink.
- Sessions: 15 min access token + 30 day rotating refresh cookie (`cn_refresh`). Reuse of a rotated
  token revokes all sessions (logged as `[auth] every session … revoked`), except within
  `REFRESH_REUSE_GRACE_MS` (30 s) of a rotation whose successor is still alive, or when the successor
  was never used, at any age (refresh response lost, e.g. a phone suspended mid-refresh: the successor
  is `retired`, a new session is issued, logged as `[auth] lost refresh … recovered`). Only once: a
  retired token, or the old token again after its recovery, counts as reuse. A session closed on purpose
  (signed out, or closed by a password change, a reset or a role change: reason `signedOut`/`revoked`)
  is simply refused (401) and never revokes the others. Routes with `roles` read the roles from the
  database at every request, not from the token. The
  frontend signs out only on a 401 from refresh; the startup restore keeps retrying while the backend
  is unreachable (guards wait), then retries in the background.
- Scheduler (`backend/src/lib/scheduler/war-sync-scheduler.ts`) syncs wars, CWL, raids and
  commendations. Commendations are awarded once per closed period and frozen.
- Donations (`donor` commendation): the in-game `memberList[].donations` counter resets when a
  player leaves the clan and at season end, so the backend adds up the counter's growth between
  reads (`DonationCounters` → `DonationTotals`, per Gold Pass season from `/goldpass/seasons/current`,
  `backend/src/modules/donations/`) and reads once more a minute before the season ends.
- Base arsenal (`backend/src/modules/bases/`): the town hall level comes from the in-game layout
  link (`TH18:HV:…`). Screenshots are shrunk in the browser (`prepareImage`), re-encoded by `sharp`
  as WebP (`thumb` 640 px, `full` 1400 px) and kept in MongoDB (`BaseImages`, behind the
  `ImageStore` interface; max 400 bases for the free cluster). `GET /base-images/{key}/{variant}` is
  public: the key is random and changes with the image, so responses are cached as immutable.
- Telegram (`backend/src/modules/telegram/`, off without `TELEGRAM_BOT_TOKEN`): every published base is
  posted in the channel bound to its town hall (`TelegramChats`, set in the Channels tab of `/admin/publishing`), picture as JPEG,
  Italian caption (troops in English, author = linked account with the highest role, then town hall,
  chosen once) and a "copy base" button. `requestBasePostSync()` (called after every change of the
  arsenal and every 5 min) compares each base with its `TelegramBasePosts` record and sends, edits,
  moves or deletes the post; failures wait and are retried, never blocking the site. A base lives in one
  channel only, the one bound to its town hall: a channel unbound or removed loses its posts (they wait),
  a rebound one gets them moved in. A `locked` chat cannot change town hall or purpose or be removed. The
  `announcements` chat (`purpose`, one only) never gets a town hall nor bases. Direction is
  always site → Telegram. Announcements (`backend/src/modules/announcements/`): after every sync the
  scheduler prepares drafts for each clan of the Crusade (closed month with its Raid Weekends, CWL
  season, donation season, beaten record; perfect wars every 25, main clan only; a member's league
  never reached before, Electro 31 to Legend I, Legend I at every arrival, one draft per player,
  `PlayerLeagueBests`; large badges in `public/game/league-tiers/large/`; a member ending a Legend League
  season in Legend League I among the first 10,000 of the world, from `modules/legends/`; every ended war and
  every Raid Weekend once its commendations are awarded, only those ended after the kinds were added,
  `AnnouncementBaselines.kindsSince`; opponent badges read from `api-assets.clashofclans.com` only), published or
  discarded by administrators in the Announcements tab of `/admin/publishing` (site only, no Telegram buttons),
  where a switch per kind turns its drafts on or off (`AnnouncementSettings`, `announcement-settings.service.ts`:
  what closes while a kind is off is not announced later, records beaten meanwhile become the baseline). Captions and
  pictures come in the language of the page (`?lang=`, words in `announcement-texts.ts` for it/en/es) and
  a post goes out in it; a published one keeps its `language`. Captions end with hashtags (kind and clan,
  base posts `#TH17`); `announcementLink` gives the page of the site an announcement leads to (main clan:
  `/statistics?period=`, `/cwl?season=`, `/players/{tag}`…; sister clans: `/`; none without an `https` `APP_URL`):
  the "crociatanera.it" of the caption links it, and a single picture gets an "Open on the site" button
  (albums cannot have buttons). Pictures are
  SVG drawn on the server in the PDFs' iron look (`image/`, colours copied from `--cn-pdf-*`, kept equal by
  `test/announcement-theme.test.ts`), text
  turned into paths with opentype.js (its own text layout and `toPathData` are broken, glyphs are placed
  by hand); what those fonts lack in names (emoji, other scripts) is drawn by Pango through `sharp` with
  the system's Noto fonts (installed in `deploy/backend.Dockerfile`) as pictures, prepared ahead
  (`SvgText.prepare`), files of `public/` read via `readSiteAsset`
  (copied to `/app/site-assets` by `deploy/backend.Dockerfile`). Only periods closed after a clan was
  first seen get drafts (`AnnouncementBaselines`). Updates of the bot: webhook `POST /telegram/webhook` with
  `TELEGRAM_WEBHOOK_SECRET` (production), `getUpdates` without it (dev, own dev bot: a bot has one
  webhook). The Bot API cannot create channels: a town hall without one waits. Tests: `mockTelegramApi`.
- CWL line-up selections (`backend/src/modules/cwl/cwl-selection.*`): one per season (`CwlSelections`), the open
  one live (first month from now whose CWL has not started), closed by an administrator or by the scheduler when
  the main clan's group of its season is saved: the ranking is frozen, a `lineup` announcement draft is prepared
  and the next season opens; reopened while its CWL has not started. Exclusions are for one season or
  `untilRevoked` (`season: null`).
- Data migrations run at startup from `backend/src/instrumentation.ts` and must be idempotent.
- Legend League seasons (`backend/src/modules/legends/`): tournaments of four weeks, ending on Monday at
  05:00 UTC, sometimes followed by a week of break. The one in progress starts at `currentLeagueSeasonId`
  (seconds) of the profile of a player in Legend League I (for the other leagues it is the weekly
  tournament). `GET /leagues/29000022/seasons` lists the ended ones (`v2-<end>`), `/seasons/{id}?limit=10000` gives
  the final world ranking (the first 10,000 stay in Legend League I). The country ranking
  (`/locations/{id}/rankings/players`, top 200) is reset at the end, so the scheduler reads it 3 minutes
  before (`legendCheckAt`) and the country position is worked out from the final world positions.
- CoC API gotchas: names come back in English only; `battlelog` is lowercase; season rankings need
  `limit` 100–25000; `capitalraidseasons` lists members only for the ongoing weekend (saved by the
  backend); the official API is GET-only except `verifytoken`.

## Environments and data

- MongoDB Atlas cluster `crociata-nera-prod`: database **`Prod`** (VPS) and **`dev`** (local,
  `backend/.env.local`). Always keep the database name in `DATABASE_URL`, otherwise MongoDB silently
  uses `test`. To bring `dev` back to the state of `Prod` (all but the arsenal, Telegram, users and
  sessions): `backend/scripts/copy-prod-to-dev.mjs` (skill `crn-copy-prod-to-dev`, plan first, `--apply`).
- Production VPS: `ssh -i ~/.ssh/crociata_vps root@217.61.63.44`, app in `~/crociata_nera/deploy`.
  Claude cannot SSH into it: give the user the commands to run there.

## Rules

- Never print, paste or commit secrets (CoC token, JWT secret, Mongo connection strings). Check env
  files by variable name only; mask URIs with `sed -E 's#://[^@]*@#://***@#'`.
- Never commit `.vscode/settings.json`, `.env`, `backend/.env.local`, `deploy/.env`. Stage files
  explicitly, never `git add -A`.
- `../continental_be` is a reference only: never modify it.
- Every Clash of Clans datum reaches the frontend through the backend (`/api/v1`), never from the
  official API: one path, one cache. The backend reads the API live with its client
  (`lib/coc/live-coc.ts`, responses kept in memory: clan 1 min, current war 30 s, war log 5 min,
  profiles 10 min) and keeps the official format (`GET /clan`, `/wars/current`, `/wars/warlog`,
  `/players/{tag}/profile`), mapped by the frontend's `coc-api.mappers.ts`; an API failure answers
  502 `ERROR.COC_API_UNAVAILABLE`. Clan routes stay behind `clanAccess`: public pages get ad-hoc
  routes with only what they show (`GET /welcome`: the clans with members by name and role, the
  rankings; used by the welcome page, "Join us" and the header badge); the profile gets
  `GET /auth/me/memberships`.
- Respect the Supercell Fan Content Policy: keep the always-visible footer notice, no monetisation
  of features, do not modify Supercell assets.
