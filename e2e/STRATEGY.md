# End-to-end test strategy

How to run and write the tests: [README.md](README.md). This document explains what the suite
protects, why it is built this way, what it does not cover, and the defects it found — in the
application and in the suite itself.

## 1. The application under test (audit, November 2026)

- **Frontend** — Angular 22 SPA (standalone, zoneless, signals), Angular Material, ngx-translate
  (it/en/es), service worker in production. Guards: `authGuard`, `clanGuard`, `leaderGuard`,
  `adminGuard`, `guestGuard`; return address sanitised by `safeReturnUrl`. Tables filtered, sorted
  and paged by the backend (`serverTable`). Good accessibility: roles and names almost everywhere.
  Angular's global error listeners catch uncaught errors and log them (`console.error('ERROR', …)`).
- **Backend** — Next.js 16 route handlers, 80 operations under `/api/v1`, each wrapped by
  `apiHandler` (rate limit per address from `X-Forwarded-For`, origin check, JWT, roles read from
  the database, clan/leader access from verified game accounts). Every operation is documented in
  OpenAPI with its access level (`x-access`). zod validation, `BaseResult` + message keys.
- **Auth** — access token (JWT HS256, 15 min, memory only) + rotating refresh cookie (`cn_refresh`,
  httpOnly, SameSite=Strict, path `/api/v1/auth`, Secure in production) with reuse detection. Email
  confirmation and password reset by emailed one-time links. First administrators via
  `ADMIN_EMAILS` once the address is confirmed.
- **Access levels** — anonymous · signed-in · member of a clan of the Crusade (verified game account
  in Nera, Rossa or d'Oro) · leader/co-leader · administrator.
- **Data** — MongoDB (Atlas `Prod` / `dev`). Game data synced by a scheduler from the Clash of Clans
  API (wars, CWL, raids, members, records, commendations, legends, announcement drafts).
- **External services** — Clash of Clans API (read + `verifytoken`) and its picture CDN
  (announcement pictures draw opponent badges from `api-assets.clashofclans.com`), SMTP, Telegram
  Bot API (base posts, announcements).
- **Existing tests** — backend: Vitest + in-memory MongoDB, route handlers called directly with an
  OpenAPI contract check (strong unit/integration coverage). Frontend: Vitest page specs with mock
  services. No end-to-end tests: nothing exercised the real browser ↔ HTTP ↔ backend ↔ database path.
- **CI/CD** — GitHub Actions `deploy.yml`: Frontend and Backend jobs on PRs and pushes; a push to
  `master` deploys to the VPS when they pass.

**Testing challenges found**: every real dependency is either production-only (Atlas, VPS) or
shared with developers (Atlas `dev`, dev Telegram bot); `next start` silently loads
`backend/.env.local`; the game API needs an IP-bound token; rate limits are per address and tight
(5 sign-ups / 15 min); a verified game account can belong to one user only; game data depends on
the current date; the welcome page is a WebGL scroll animation.

## 2. Framework: Playwright

Chosen because it covers every requirement with one dependency (`@playwright/test`, pinned):
Chromium, Firefox and WebKit; browser contexts for parallel, isolated sessions (several users in one
test); `APIRequestContext` sharing cookies with the browser (sign in through the API, then use the
page); request interception (error states); traces, screenshots and videos on failure; HTML/JUnit/
GitHub reporters; `webServer` to start the stack; a TypeScript runner that needs no build step.
Cypress was not chosen: one tab and one origin per test make multi-user journeys and
cross-browser WebKit runs awkward, and cookie-level checks need plugins. The existing Vitest suites
stay as they are: they are the right tool for rules and handlers.

The isolated stack reuses what the project already has: `mongodb-memory-server` of the backend
tests, `sharp` of the backend (test pictures), `scripts/serve-prod.mjs` (now accepting
`API_TARGET`). No other dependency was added.

## 3. Strategy

- **Black box over real HTTP.** Production builds, real browser, real backend, real database, real
  synchronisation code; only the external services are replaced by local fakes speaking their
  protocols (HTTP JSON, SMTP, pictures).
- **Isolated by enforcement, not only by configuration.** Besides pointing every setting at the
  fakes, the stack's servers run behind a network guard that refuses every connection except the
  stack's own loopback ports, and the run fails if one was ever attempted (README, "Isolation
  guarantees").
- **Assert outcomes, not pages loading.** Each journey checks what the user sees _and_ what was
  persisted or enforced (API, read-only database lookups). Expected values are computed from the
  stack's data, compared whole, never as loose substrings.
- **Security at the backend, against a written requirement.** Authorization is verified by calling
  every operation directly, for every kind of caller, against a hand-written specification
  (`tests/security/access-spec.ts`) rather than against what the backend says about itself; token
  forgery, CSRF, CORS, rate limits and data exposure are checked over HTTP.
- **Mocks only where unavoidable.** Interception is used in two tests to simulate a failure that
  cannot be produced on demand (game API down, an expired token); everything else goes through the
  real stack.
- **Isolation by construction.** Fresh in-memory database per run; per-test users, addresses, game
  accounts and administrator addresses; every base a test's users create is deleted after it, even
  when it fails; shared settings restored to the value found, in `finally`.
- **Known bugs pinned precisely.** A known bug is a test asserting the exact wrong behaviour, never
  `test.fail()` (which any failure satisfies); it fails when the bug is fixed.

### Priorities

- **P0** — must never break: sign-up/sign-in/sign-out, sessions and their revocation, email and
  password recovery, every authorization rule (API and pages), token and CSRF defences, ownership,
  data exposure, the isolation of the stack.
- **P1** — used every day: clans' data pages, account linking, base proposals and moderation,
  administration of users, failure handling.
- **P2** — secondary: filters/sorting details, language, PDF export, publications settings, edge
  pages, accessibility of the administration switches.
- **P3** — minor: offline banner, phone navigation, Telegram-off notice.

## 4. Coverage matrix

89 tests (45 P0 · 26 P1 · 15 P2 · 3 P3): security 36, auth 19, clan data 11, admin 8, account 6,
experience 5, bases 4. 11 of them also run on Firefox and WebKit (`@cross`), 1 on a phone viewport
(`@mobile`), 3 pin known bugs (`@known-bug`). ✔ = covered, — = not applicable.

| Feature | Happy path | Negative / validation | Permissions | Persistence checked | Spec |
|---|---|---|---|---|---|
| Sign-up | ✔ UI, signed in at once, confirmation email | ✔ client-side checks announced on each field (no request sent), taken email/username (case-insensitive), backend validation alone, mass assignment (`roles`, `emailVerified`, `playerTags` ignored) | — | ✔ bcrypt hash stored, sign-in works | `auth/sign-up` |
| Sign-in | ✔ username, email (any case), return to the page asked for | ✔ wrong password = unknown user (same status and body) | ✔ open-redirect attempts (4 variants) | — | `auth/session`, `security/route-guards` |
| Session | ✔ survives reload and new tab; silent renewal after a rejected access token | ✔ cookie flags (HttpOnly, SameSite=Strict, path, Secure), no token in web storage | — | ✔ sessions closed in the database | `auth/session` |
| Sign-out | ✔ UI, protected page left | ✔ stolen copy of the cookie refused; rotated and current tokens both dead | — | ✔ | `auth/session` |
| Email confirmation | ✔ link from the email, single use | ✔ forged token, old link after "send again", already confirmed | — | ✔ `emailVerified` | `auth/account-recovery` |
| Password reset | ✔ email link → new password, every device signed out | ✔ single use, same answer for unknown addresses and no email sent | — | ✔ old password refused, new accepted | `auth/account-recovery` |
| Password change | ✔ this device kept, others signed out | ✔ wrong current password; **BUG-01** pinned | — | ✔ live sessions counted | `auth/account-recovery` |
| Game accounts | ✔ link with token from the profile opens the clans' pages at once; unlink closes them | ✔ wrong token, unknown tag, invalid tag, game API unavailable, account outside the Crusade, account verified by another user | ✔ nobody unlinks someone else's account | ✔ | `account/linked-accounts` |
| Authorization (API) | ✔ every operation, for each allowed caller: exact answer of a probe that changes nothing | ✔ all 80 operations × 6 callers (anonymous, outsider, member, sister clan member, leader, administrator): exact 401/403 with the level's message key and no data | ✔ against `access-spec.ts`; the API's operations and documented levels must equal it | — | `security/authorization-matrix` |
| Authorization (pages) | ✔ each level reaches its pages | ✔ redirects of signed-out users (with `returnUrl`), outsiders, members, leaders | ✔ sister clans | — | `security/route-guards` |
| Tokens | ✔ | ✔ other secret, `alg: none`, tampered payload, wrong audience, malformed | ✔ demoted admin loses access with a live token; deleted user locked out | ✔ | `security/api-hardening` |
| CSRF / CORS | ✔ | ✔ foreign `Origin` refused on cookie routes (session untouched); preflight only for the site | — | ✔ | `security/api-hardening` |
| Rate limits | ✔ another address unaffected | ✔ 11th sign-in → 429 + `Retry-After` even with the right password; reset requests | — | — | `security/api-hardening` |
| API docs, health, cron | ✔ admin by token and by HTTP Basic | ✔ anonymous 401 + `WWW-Authenticate`, member 403, wrong Basic, cron without secret | ✔ | — | `security/api-hardening` |
| Information exposure | — | ✔ no secret in 11 kinds of response: field names (any case, any depth: `passwordHash`, `tokenHash`, reset/verify token hashes, refresh tokens…), bcrypt values, and the user's actual stored hashes and refresh tokens; the detector itself is tested; malformed JSON and unknown routes give clean errors | — | ✔ secrets read from the database | `security/api-hardening` |
| Network isolation | ✔ the stack's own ports reachable | ✔ guard active in both servers (self-test); a guarded process refused for the game CDN, game API, Telegram, production, SMTP relay, public IP, Atlas SRV lookup, DNS, dev backend, local MongoDB, UDP; no CDN URL in served or saved data; no attempt during the whole run (teardown) | — | ✔ saved wars | `security/network-isolation` |
| Dashboard / current war | ✔ exact score and opponent from synced data, every participant | — | — | — | `clan/clan-data` |
| War history / details | ✔ counts computed from the wars, each war's result and score cell | ✔ unknown war | — | — | `clan/clan-data` |
| Players | ✔ all members, backend filter (request checked), sorting (first rows in order), player page | — | — | — | `clan/clan-data` |
| Raid Weekend / statistics | ✔ totals equal to the game's | — | — | — | `clan/clan-data` |
| Welcome / Join | ✔ live data of the three clans, full motion, Fan Content notice | — | ✔ public | — | `clan/clan-data` |
| CWL selections | ✔ leader sees the ranking | — | ✔ (route guards, matrix) | — | `clan/clan-data` |
| Base proposals | ✔ propose with a real screenshot → approve → visible with its copy link | ✔ empty rejection reason, invalid/builder link, missing or broken picture, duplicate layout (each with its message key) | ✔ other members cannot edit/withdraw (404) or moderate (403) | ✔ | `bases/base-proposals` |
| Rejection | ✔ reason shown to the author, withdraw | — | — | ✔ | `bases/base-proposals` |
| Users administration | ✔ grant/remove ADMIN (applies at once, sessions closed), link accounts without token, delete with typed confirmation | ✔ wrong confirmation, own row protected (UI and API); **BUG-02** pinned | ✔ | ✔ user and sessions gone | `admin/users-admin`, `security/api-hardening` |
| Publications | ✔ draft kinds switched and kept, restored to the value found | ✔ Telegram not configured; **BUG-02** pinned | ✔ | ✔ | `admin/publishing` |
| Resilience | ✔ "Retry" after a game API failure; offline banner | — | — | — | `experience/experience` |
| Language, PDF, phone | ✔ Italian kept after reload; Raid Weekend PDF (valid file); navigation drawer | — | — | — | `experience/experience` |

Every test also fails on an uncaught error in any of its pages (including errors Angular catches
and logs) and on an outbound connection attempted by the stack.

## 5. Bugs found in the application

Each one has a `@known-bug` test that asserts the exact wrong behaviour of today (README,
"Conventions"): it passes while the bug is there and fails, with a message saying so, as soon as
the bug is fixed. None is fixed by this work.

### BUG-01 — Another device coming back after a password change signs out the device that changed it

**Severity: medium** (sessions; visible to users, frequent; fails safe — it signs users out, it
never lets anyone in). **Priority to fix: high**, it hits every user with two devices.

Root cause: `changePassword` and `resetPassword` (`account.service.ts:108`, `:156`) and a role change
by an administrator (`admin.service.ts:99`) close the user's other sessions with reason `revoked`.
`refresh()` (`auth.service.ts:111-123`) treats *any* closed session presented again as stolen,
unless it is a recent rotation or a lost rotation — and a `revoked` session is neither — so it calls
`revokeAllSessions(…, 'reuse of a revoked refresh token')` (line 122). The other devices of the user,
exactly the ones just signed out, present their old cookie at their next page load: that closes the
session the password change (or the reset, or the new role) had just opened or kept. The same
happens when a `signedOut` session is presented again.

Pinned by `auth/account-recovery.spec.ts` "another device coming back after a password change signs
out the device that changed it (BUG-01)": after the change the device has exactly one live session
(asserted), the old device's refresh is refused (401, as it should), then zero live sessions remain
and the device is signed out at its next load (the bug). Backend log:
`[auth] every session of user … revoked: reuse of a revoked refresh token`.

Recommended fix (backend, `auth.service.ts`): when the presented session was closed with reason
`revoked` or `signedOut`, answer 401 `INVALID_REFRESH_TOKEN` without closing the other sessions;
keep the theft response for reused `rotated`/`retired` tokens outside their grace rules. Add a
backend test in `test/auth.test.ts`, then turn the e2e test into the correct expectation (written
next to its assertions).

### BUG-02 — Unnamed switches in the administration

**Severity: low–medium** (accessibility, WCAG 4.1.2 "Name, Role, Value"; administrators only).

Root cause: the templates bind `[attr.aria-label]` / `[attr.aria-labelledby]` on
`<mat-slide-toggle>`. `MatSlideToggle`'s own host bindings clear those two attributes on the host
element (it expects them as its inputs and forwards them to its inner button), so the label is lost
entirely. The focusable `role="switch"` button is then named by the toggle's own `<label>`, which is
empty: screen readers announce "switch, on" without saying whose role or which kind of draft it
changes. `[attr.aria-describedby]` is not cleared, but stays on the host, which is not the focused
element, so the description ("when" a kind of draft is prepared) is not announced either. Seen in
the DOM:
`<mat-slide-toggle aria-describedby="draft-kind-when-month"><button role="switch" aria-labelledby="…-label">…</button><label id="…-label"></label></mat-slide-toggle>`.

Instances:
1. `features/admin/admin-page.html:99` — ADMIN switch of each user row: no name.
2. `features/admin/publishing/announcements/announcement-settings-form.html:27-28` — switch of each
   kind of announcement draft: no name, no description.
3. `features/admin/publishing/channels/telegram-bot.html:86` — lock switch of each Telegram chat:
   named "Lock" by its visible text, but without the chat's name, so the switches of different chats
   cannot be told apart. Not covered end to end: the stack runs without Telegram, so no chat is
   listed.

Pinned by `admin/users-admin.spec.ts` and `admin/publishing.spec.ts` "… have no accessible name
(BUG-02)" (empty name, intended label absent from the row; empty description).

Recommended fix: use Material's inputs — `[aria-label]`, `[aria-labelledby]`, `[aria-describedby]`
— which reach the button, in the three templates; then turn the two tests into checks of the
intended names (and description).

### OBS-01 — Users table once showed rows contradicting its filter (not reproduced)

In 1 of 246 runs under heavy load, right after deleting a user from the administration table
filtered by that username, the table showed the unfiltered first page (other users, and the user
just deleted) while the filter box still held the username. Three targeted experiments (slow first
page, deletion during the filtered load, stale filtered answer delivered after the deletion) all
behaved correctly, and it has not happened again in the later runs, so the cause is unknown.
Suspect: the local `users.update(...)` of `admin-page.ts` racing a request of `serverTable`. The
test now waits for the filtered page before acting, which is what a user sees; the scenario
"delete while the filter is still loading" remains open. No change was made for it.

## 6. Defects found in the suite itself (and fixed)

Found by the review of the suite before its first pull request; listed so the same mistakes are not
made again.

- **The page-error check caught nothing.** It listened for the browser's `pageerror`, but Angular
  catches uncaught errors and rejected promises itself and only logs them, so no test could ever
  fail on an application error. It now also collects Angular's `ERROR` reports, on every page of a
  test (other tabs and `pageAs` pages included); proven by deliberately throwing in each kind of
  page. The full suite produces none.
- **Known-bug tests could pass for any reason.** They used `test.fail()`, satisfied by any failure
  (a broken locator, a page that does not load). Replaced by exact assertions of the wrong
  behaviour (`knownBug()`); proven by simulating the BUG-02 fix in the browser, which makes the
  test fail with its "may have been fixed" message. Writing them precisely corrected the root cause
  first given for BUG-02 (the label is dropped, not moved to the host).
- **The authorization matrix trusted the backend's own documentation.** A route documented and
  implemented with the same wrong level passed. It now checks against `access-spec.ts`, also probes
  writes for allowed callers (exact answers, nothing changed), and fails if a level in the code,
  the documentation or the specification changes alone (proven by changing one level and removing
  one operation from the specification).
- **The exposure check missed `tokenHash`** (case-sensitive `TokenHash`). Replaced by a detector of
  field names (any case, any depth), bcrypt values and the user's actual stored secrets.
- **The stack was isolated by configuration only**, and its fake data used real CDN URLs that the
  backend's announcement pictures would fetch. Now local URLs, plus the network guard.
- **Weak assertions**: substring checks of small numbers (`toContainText('2')`), counts typed in the
  test, English texts in locators, the `mat-form-field` CSS selector for field errors. Replaced by
  values computed from the data, whole-text accessible comparisons, translation keys, accessible
  descriptions.
- **Clean-up gaps**: published bases deleted only at the end of a passing test; a shared setting
  restored to `true` instead of the value found; administrator addresses never given back (a reused
  stack ran out after ~18 runs). All fixed in the fixtures.
- **The e2e code was not type-checked on CI** (Playwright does not check types). `typecheck:e2e`
  now covers the stack's JavaScript too and runs first in the `E2E` job.

## 7. What is not covered, and why

| Gap | Reason | Where it is covered instead |
|---|---|---|
| Theft detection of a reused *rotated* refresh token | Needs the 30 s grace period to pass: the backend clock cannot be moved from outside | backend `test/auth.test.ts` (fake timers) |
| Access-token expiry (15 min) | Same (time) | backend tests; renewal path simulated in `auth/session` |
| CWL in progress, CWL selection close/reopen, exclusions | One global selection per season: closing it in parallel tests would change what others see; a CWL league group needs a time-coherent fake season. The matrix only checks who may call them, with probes that change nothing | backend `test/cwl*.test.ts`, frontend specs; candidate for a serial project with its own stack |
| Commendations, records, announcement drafts, their pictures and publication | Produced by period closes at real dates (the stack has no draft, so no announcement picture is drawn); Telegram publication would need a fake Bot API with state | backend tests (`announcements`, `commendations`, `records`, `telegram`); the network guard makes sure a picture could never fetch a remote badge |
| Telegram base posts, channels, webhook secret | Telegram is off in the stack by design (no bot token, no webhook secret; the stand-in refuses everything) | backend `test/telegram.test.ts` with `mockTelegramApi` |
| Successful writes of the administration beyond what the journeys do (edit/delete a base directly, players sync, bases PDF editor) | The matrix proves who may call them; their effects are rules of the backend | backend `test/bases.test.ts`, `admin.test.ts`, frontend specs |
| Service worker, update prompt, offline data | Blocked on purpose (`serviceWorkers: 'block'`) so tests see the network | manual check with `npm run start:prod` |
| Caddy: security headers, CSP, `X-Forwarded-For` overwrite (the rate limits rely on it), 410 on `/api/coc` | The stack serves the build with `scripts/serve-prod.mjs`, not Caddy; the tests depend on choosing their own `X-Forwarded-For` | review of `deploy/Caddyfile`; post-deploy health check. Recommended: a post-deploy smoke check that a forged `X-Forwarded-For` does not reset the sign-in limit |
| Real Clash of Clans payload drift | The fake API is built from the documented format | backend schemas tolerate unknown fields; production logs |
| Visual regressions | Out of scope for a functional suite; the site's look changes often | manual browser check (CLAUDE.md) |
| Firefox/WebKit on CI | Kept off CI to keep the pipeline fast; run locally with `test:e2e:cross` | 11 `@cross` journeys pass locally on both |
| Native programs started by the stack's servers, the stack's orchestrator | The network guard covers Node's network APIs; the orchestrator must download MongoDB on a new machine | none needed today: the servers start no native program |

## 8. Recommendations

1. Fix BUG-01 (frequent, visible) and BUG-02 (accessibility, three templates); turn their tests into
   checks of the correct behaviour.
2. Keep `E2E` among the required checks of the "Protect master" ruleset, with source "GitHub
   Actions".
3. Add an automated accessibility scan (e.g. axe) to the main pages: BUG-02 shows the value.
4. A second, serial Playwright project with its own stack for global-state features (CWL selection
   lifecycle, announcement drafts and pictures, publication with a stateful fake Telegram).
5. Run `test:e2e:cross` weekly on CI (scheduled workflow) to catch engine-specific regressions.
6. Consider `failOnFlakyTests: true` for pushes to `master`, so a test that passes only on its retry
   blocks the deploy instead of only being reported.
7. Keep the fake game data in step with the official API when the backend starts reading new fields.
