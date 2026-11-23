# End-to-end tests

Playwright tests that drive the real site — production builds of the Angular frontend and the
Next.js backend — in a browser, against an **isolated stack**: an in-memory database, local fakes
of every external service, and servers that cannot open any outbound connection (see
[Isolation guarantees](#isolation-guarantees) for exactly what is enforced and how).

Why these tests exist, what they cover and what they don't: [STRATEGY.md](STRATEGY.md).

## Quick start

```sh
npm ci && npm --prefix backend ci      # once
npx playwright install chromium        # once (add firefox webkit for test:e2e:cross)
npm run typecheck:e2e                  # type check of the tests, their support code and the stack
npm run e2e:build                      # after every change of src/, public/ or backend/src/
npm run test:e2e                       # the suite (Chromium desktop + phone)
npm run test:e2e:report                # open the HTML report of the last run
```

No `.env` file, no account and no secret is needed: the stack creates everything it uses.

## Commands

- `npm run typecheck:e2e` — type check of `e2e/` (strict TypeScript for the tests and support
  code with `e2e/tsconfig.json`; the stack's JavaScript with `e2e/tsconfig.stack.json`).
  Playwright runs tests without checking types, so CI runs this first.
- `npm run e2e:build` — production builds of the frontend (`dist/`) and the backend
  (`backend/.next`). The stack refuses a build older than its sources (`E2E_ALLOW_STALE_BUILD=1`
  to force).
- `npm run test:e2e` — whole suite, headless: Chromium desktop, and the `@mobile` tests on a phone
  viewport. Starts and stops its own stack.
- `npm run test:e2e:cross` — the `@cross` journeys on Firefox and WebKit (local only, not on CI).
- `npm run test:e2e:all` — every project (Chromium, phone, Firefox, WebKit).
- `npm run test:e2e:headed` — same as `test:e2e`, with visible browsers.
- `npm run test:e2e:ui` — Playwright UI mode: pick tests, watch them step by step, time-travel
  the DOM.
- `npm run test:e2e:debug` — Playwright inspector, paused at the first step.
- `npm run test:e2e:report` — opens `e2e/.artifacts/report`.
- `npm run e2e:stack` — starts the stack alone and keeps it running (see "Faster iterations").

One file, one test, one tag:

```sh
npx playwright test e2e/tests/auth/session.spec.ts --project=chromium
npx playwright test -g "revokes the session" --project=chromium
npx playwright test --grep @P0 --project=chromium       # tags: @P0…@P3, @cross, @mobile, @known-bug
npx playwright test --project=chromium --repeat-each=3  # hunting flaky tests
```

### Faster iterations

Each run starts a fresh stack (empty database, ~15 s). While writing tests keep one running:

```sh
npm run e2e:stack                                   # terminal 1, Ctrl+C to stop
E2E_REUSE_STACK=1 npm run test:e2e:ui               # terminal 2, as many runs as needed
```

Tests are written to pass on a stack that already ran other tests (unique users; game accounts,
administrator addresses, bases and settings given back by every test), so reusing it is safe; CI
always uses a fresh one. If a reused stack gets into a bad state (a test was killed half-way
through its clean-up, a pool reports "no free account"), stop it and start it again: everything
lives in memory, so a restart is a complete reset.

## The stack

`e2e/stack/start-stack.mjs` (started by Playwright's `webServer`, or by `npm run e2e:stack`):

```
browser ──► frontend :4410 (dist/, served as by Caddy) ──/api/v1──► backend :3110 (next start)
                                                                      │
                     MongoDB in memory ◄──────────────────────────────┤
                     fake Clash of Clans API  :4610/v1 ◄──────────────┤
                     badges of the fake data  :4610/assets ◄──────────┤
                     Telegram stand-in        :4610/telegram ◄────────┤ (bot off, refuses all)
                     SMTP sink                :4625 ◄─────────────────┘
tests ──► control API :4610/__e2e (accounts, mailbox, game data, read-only database lookups,
                                   network guard report)
```

- **Game data** (`game-data.mjs`): three clans, 28 + 13 + 7 members with fictional names and tags,
  three finished wars (win, loss, win) and a war on its battle day for Crociata Nera, two Raid
  Weekends, no CWL, Crociata d'Oro with a private war log. Times are relative to the start of the
  stack. Clan badges point at the fake API (`:4610/assets/…`), never at the game's CDN. The data
  reaches MongoDB through the **real synchronisation** (`POST /cron/war-sync`, run once per war
  with the fake `currentwar` switched in between); the built-in scheduler is off
  (`WAR_SYNC_INTERVAL_MINUTES=0`), so nothing changes under the tests.
- **Logs** of the backend and frontend servers: `e2e/.artifacts/stack/*.log`.

### Isolation guarantees

Four independent layers; each would be enough to stop the common mistakes, together they make an
accidental side effect outside the machine impossible from the stack's servers.

1. **Configuration.** The backend gets a minimal environment (`PATH`, `HOME`…) plus every variable
   of its configuration schema set explicitly: the database is the in-memory one, every external
   base URL (Clash of Clans API, Telegram) points at the fakes, the SMTP server is the sink,
   Telegram has no token, the scheduler is off. The variables found in `backend/.env*` are blanked,
   because Next.js loads `.env.local` even in production mode but never overrides a variable that is
   already set: no value of the developer's files (Atlas `dev`, the dev bot) can apply.
2. **Network guard** (`e2e/stack/no-egress.cjs`, preloaded with `NODE_OPTIONS=--require` into the
   backend and the frontend server only — never into development or production processes). Every
   TCP connection (net, tls, http/https, `fetch`, the MongoDB driver, nodemailer) is refused unless
   it goes to a loopback address **and** a port of the stack: the backend may reach the in-memory
   MongoDB, the fake API and the SMTP sink; the frontend server only the backend. A host name other
   than `localhost` is refused before any DNS lookup; DNS lookups and queries are refused; UDP is
   refused. So the dev backend on `:3001` (connected to Atlas `dev`), a local MongoDB on `:27017`,
   production, Atlas, Telegram, mail relays and the game's API and CDN are all out of reach.
   A refused attempt fails like a network error (`E2E_EGRESS_BLOCKED`) and is logged as
   `[e2e-egress] blocked …`.
3. **Checks before "ready".** The stack does not let a single test run unless: the guard is loaded
   in both servers and its self-test passed (three forbidden connections tried and refused; their
   targets are unroutable or unresolvable, so even a broken guard would send nothing); the shared
   administrator it signs up is found in the in-memory database (proof the backend writes nowhere
   else); the backend called the fake game API.
4. **Checks during and after the run.** `security/network-isolation.spec.ts` checks the guard's
   report and makes a guarded process try real targets (the CDN the announcement pictures are read
   from, the game API, Telegram, an SMTP relay, an Atlas SRV lookup, the dev backend's port…),
   expecting every one to be refused; it also checks that no data the backend serves or saved points
   at the game's CDN. After the last test, the global teardown (`support/global-teardown.ts`) fails
   the run if any server of the stack attempted an outbound connection at any moment.

The browser side is closed too: every browser context of the tests refuses requests to hosts other
than `localhost`/`127.0.0.1` (fonts, external pictures…).

What is not covered by the guard: native programs started by a server (the backend starts none),
and the stack's own orchestrator process (`start-stack.mjs`), which is not guarded because
`mongodb-memory-server` downloads the MongoDB binary on the first run of a machine.

- **Ports** never collide with development (4200, 3001, 4400). Override with `E2E_FRONTEND_PORT`,
  `E2E_BACKEND_PORT`, `E2E_FAKES_PORT`, `E2E_SMTP_PORT`.
- `NODE_ENV=production`: secure cookies, API docs for administrators only, real emails through
  SMTP — the production behaviour.

## Writing tests

Import `test` and `expect` from `e2e/support/fixtures.ts`, never from `@playwright/test`:

```ts
import { expect, test } from '../../support/fixtures';
import { t } from '../../support/i18n';

test('a member sees the players @P1', async ({ page, users, signIn }) => {
  const member = await users.create({ access: 'member' }); // real sign-up + verified game account
  await signIn(member); // refresh cookie into the browser
  await page.goto('/players');
  await expect(page.getByRole('heading', { name: t('nav.players'), level: 1 })).toBeVisible();
});
```

### Fixtures

- **`users.create({ access, admin, verified })`** — a new user through the real API: sign-up,
  optional email confirmation through the link of the received email, game account linked with the
  in-game token check. `access`: `none` (default), `outside`, `member`, `sister`, `leader`.
  `admin: true` uses an address of `ADMIN_EMAILS` (see "Administrators" below). Returns
  `{ id, email, username, password, tag, playerName, api }`; `api` is signed in as the user.
  After the test, whatever happened in it, the clean-up deletes every base the test's users created
  (pending, rejected or published), unlinks and gives back their game accounts, and deletes the
  administrators it made. A clean-up step that fails fails the test.
- **`users.reserveAccount(pool)`** — a free game account for the test to link itself (e.g. through
  the profile page); given back after the test.
- **`signIn(user, page?)`** — signs the test's browser in (API sign-in inside the browser context:
  the httpOnly cookie lands where the app expects it).
- **`pageAs(user)`** — a page in a new browser context signed in as `user`: a second person in the
  same test (e.g. the moderator next to the author).
- **`api`** — anonymous API client (own cookie jar), through the frontend's proxy.
- **`sharedAdmin`** — the administrator created by the stack (worker-scoped). Use it for set-up and
  clean-up only; never change it (password, roles).
- **`ip` / `extraHTTPHeaders`** — every test calls from its own random address
  (`X-Forwarded-For`), so the per-address rate limits never mix tests.
- **`pageErrors`** (automatic) — an uncaught error in any page of the test fails it: the test's
  `page`, other tabs and `pageAs` pages. Angular catches uncaught errors and rejected promises
  itself and reports them with `console.error('ERROR', …)`, so those reports count as page errors
  too. Opt out with `test.info().annotations.push({ type: 'allow-page-errors' })`, saying why.
  The fixture needs no browser: a test that uses only `api`/`users` opens none.

**Administrators.** `ADMIN_EMAILS` of the stack lists 300 addresses (`admin-NN@e2e.test`). A test
that asks for `admin: true` takes a free one; the clean-up deletes that administrator and gives the
address back, so the limit is 300 administrators _at the same time_, far above what the workers
use. A test killed during its clean-up keeps its address until the stack restarts (see "Faster
iterations"). The confirmation emails of an address's earlier users stay in the sink and are
skipped (`users.create` waits for the link sent after its own sign-up).

The control API (`e2e/support/stack.ts`): `stack.waitForLink(email, '/verify-email', index?)`
(polls the mailbox), `stack.mails(email)`, `stack.game()` (the data the backend synced: compare
pages with it, never with constants), `stack.find(collection, filter, projection)` (read-only
database lookup for persistence checks; `_id`, `…Id` and `…By` filter values are converted to
ObjectIds), `stack.egress()` (network guard report).

### Conventions

- **Names** say the behaviour, e.g.
  `'signing out leaves the protected page and revokes the session on the server @cross @P0'`. Tag
  every test with its priority (`@P0`–`@P3`); `@cross` runs it on Firefox and WebKit too, `@mobile`
  on a phone viewport (and not on desktop).
- **Locators**: roles and accessible names, with texts taken from the translations by key —
  `getByRole('button', { name: t('auth.signIn.submit') })`; names the app does not translate come
  from the app's own source (e.g. `LANGUAGES` for the language names). No CSS classes, no
  `nth-child`, no English typed in the test. Page objects (`support/pages.ts`) only for parts used
  by many tests (auth forms, shell, profile).
- **Assertions say exactly what is expected**, computed from the stack's data (`stack.game()`), not
  typed in. Avoid substring checks of numbers (`toContainText('2')` also matches "12"): read the
  text as assistive technologies do with `accessibleText(locator)` (separate words, decorative parts
  left out) and compare it whole, or match the exact cell with
  `getByRole('cell', { name, exact: true })`. Field errors: `expectFieldError(page, label, message)`
  checks the error is in the field's accessible description (what a screen reader announces), not
  just somewhere on the page.
- **Waiting**: web-first assertions (`await expect(locator).toBeVisible()`), `expect.poll` for
  state outside the page, `page.waitForResponse` when the test must know a request completed. No
  `waitForTimeout`.
- **Isolation**: every test creates its own users and data, with unique names; anything shared
  (a global setting) is restored to the value the test found, in a `finally`. Never depend on
  another test or on test order.
- **Verify the outcome**, not only the page: the API (`user.api`) or the database (`stack.find`)
  must agree with what the page says. Security checks go to the backend directly, not only through
  the UI.
- **API access** is specified by hand in `tests/security/access-spec.ts`: every operation with the
  level that may call it and a probe (the exact answer an allowed caller gets, from a call that
  changes nothing). The authorization matrix fails while the live API, its OpenAPI `x-access` and
  that file disagree, so a new route, or a changed level, always shows up as a change of that file.
- **A bug found** is not worked around and not hidden: document it in STRATEGY.md ("Bugs found")
  and write a `@known-bug` test with `knownBug()` (`support/known-bugs.ts`). Its steps are asserted
  as usual (a missing button fails the test), then it asserts the **exact wrong behaviour** seen
  today, with the correct one written next to it. It passes only while that bug is there; when the
  bug is fixed it fails with "… may have been fixed", and is turned into a test of the correct
  behaviour. Never `test.fail()`: any failure at all — a broken locator, a page that does not
  load — would satisfy it.

## Debugging a failure

1. `npm run test:e2e:report`: every failed test has its error, screenshot, video and **trace**.
2. `npx playwright show-trace e2e/.artifacts/test-results/<test>/trace.zip`: each step with the DOM
   before/after, console, and every network request with its response.
3. `error-context.md` next to it: the page's accessibility tree at the failure.
4. Backend side: `e2e/.artifacts/stack/backend.log` (blocked connections: `[e2e-egress]` lines).
5. Re-run just that test headed or in UI mode; `--repeat-each=5` to check it is stable.

## CI

The `E2E` job of `.github/workflows/deploy.yml` runs on every pull request and push to `master`,
in parallel with `Frontend` and `Backend`: install, `npm run typecheck:e2e`, Chromium with its
system dependencies, the two production builds, `npm run test:e2e`. The deploy job needs it: a
failing type check or end-to-end test blocks the deployment. The report, traces and videos of
failures and the stack logs are uploaded as the artifact `e2e-report-<run>` (14 days), also when
tests fail.

On CI: one retry (a test that needs it is reported as **flaky** in the report and as a GitHub
annotation: fix it, don't ignore it), 2 workers, `test.only` forbidden. No secret is used.

For the job to block merges into `master` too, the `E2E` check must be among the required checks
of the "Protect master" ruleset (GitHub settings), with source "GitHub Actions" like `Frontend`
and `Backend`.
