---
name: crn-access-control
description: The permission model of Crociata Nera and how to apply or audit it — site roles (ADMIN/USER), clan access and leader access derived from verified linked game accounts in the three clans of the Crusade, `apiHandler` options, OpenAPI `access`, Angular guards, ownership checks, sessions and secrets. Use when deciding who may see or do something, adding a protected route or page, changing roles, linked accounts or sessions, or reviewing a change for authorization and security problems.
---

# Access control and security

## The model (verified in code)

**Site roles** — `UserRole` (`backend/src/lib/auth/user-role.ts`): `ADMIN`, `USER` (default). ADMIN is
granted by an administrator (`PATCH /admin/users/{id}`) or automatically to verified emails listed in
`ADMIN_EMAILS` (`grantConfiguredAdmin`, `modules/auth/account.service.ts`).

**Derived access** — not stored, computed from `User.playerTags` (verified links only; the legacy
`pendingPlayerTag` grants nothing) and the clan rosters (`ClanRosters`, refreshed from the CoC API at
most every 5 min, last saved list used during API outages) in `modules/access/clan-access.service.ts`:

| Level | Who | Backend option | OpenAPI `access` | Frontend guard |
|---|---|---|---|---|
| public | anybody | none | `public` | none / `guestGuard` (signed-out only) |
| user | signed in | `auth: true` | `user` | `authGuard` |
| clan | ADMIN, or a verified tag in any Crusade clan (any clan role) | `clanAccess: true` | `clan` | `clanGuard` (else → `/profile`) |
| leader | ADMIN, or a verified tag that is `leader`/`coLeader` of a Crusade clan | `leaderAccess: true` | `leader` | `leaderGuard` (else → `/`); no page uses it now |
| chief | ADMIN, or the verified tag that is `leader` of the main clan (Crociata Nera, `CLAN_TAG`; `ClanRosters.chiefTags`) | `chiefAccess: true` | `chief` | — (actions only) |
| admin | ADMIN | `roles: [UserRole.ADMIN]` | `admin` | `adminGuard` (else → `/`) |
| cron / telegram | shared secret (`CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`); 404 while unset | checked in the route | `cron` / `telegram` | — |
| API docs | dev: anybody; prod: admins (Basic or Bearer) | in the route | `adminInProduction` | — |

`elder` and `member` have no special access; `elder` matters only in business rules (e.g. CWL newcomer
penalty). Roles on `roles` routes are re-read from the database at every request; on other routes the
token's roles (≤ 15 min old) are used — so never gate admin power on `user.roles` inside a non-`roles`
route.

Actions on a page every member reads can depend on the caller: the backend then returns them in the
GET (e.g. `GET /cwl/selection` → `permissions: { manage, export }`: CWL line-up read by every member,
closed/reopened and exclusions by `chief`, PDF/pictures exported by `leader`), and the page shows only those.

Frontend: `AuthService` (`src/app/core/backend/auth.service.ts`) exposes `isAdmin`, `hasClanAccess`,
`hasLeaderAccess`, `isMyPlayer`; the route tree in `src/app/app.routes.ts` groups pages under the guards.
Guards are UX only — **the backend check is the security boundary**. In mock mode auth/clan/leader guards
let everyone through.

**Ownership** (inside services): base proposals are editable/withdrawable by their author only, others get
404 (`modules/bases/base-proposals.service.ts`); linked tags are unique across users (partial unique index
on `playerTags`), max 10, proven with the in-game API token (`POST /players/{tag}/verifytoken` via
`linkPlayer`). Administrators can only unlink accounts.

**Sessions**: 15-min access token in memory, 30-day rotating httpOnly refresh cookie `cn_refresh`
(`SameSite=Strict` + `checkOrigin`), reuse detection with grace window — full rules in `CLAUDE.md`
"Backend notes" and `modules/auth/auth.service.ts`.

## Adding protection to something new

1. Pick the lowest level that works (table above). Clash of Clans data and anything about members: `clan`.
2. Backend: set the option on **every** method of the route (GET included) and the same `access` in the
   OpenAPI operation (`test/openapi.test.ts` compares them).
3. Ownership/state checks in the service, returning 404 for "not yours" when existence should not leak.
4. Frontend: put the page under the right guard group; hide actions with `isAdmin()`/`hasLeaderAccess()`
   — but the backend must refuse them anyway.
5. Tests: 401 without token, 403 with the wrong level (`CLAN_ACCESS_REQUIRED`, `LEADER_ACCESS_REQUIRED`, `CHIEF_ACCESS_REQUIRED`,
   `FORBIDDEN`), success with the right one; for ADMIN, a demoted admin loses access immediately.
   Write the level in `e2e/tests/security/access-spec.ts` too (with a probe that changes nothing): it is
   the committed security requirement, and the end-to-end authorization matrix fails while the API, its
   documentation and that file disagree, so every change of who may call what shows up in review.
6. Service worker: a private GET must not join a cached group unless it is cleared at sign-out
   (`core/pwa/offline-data.ts`, `PRIVATE_DATA_GROUP`).

## Security review checklist

- Route without access option that returns member data or writes anything.
- zod validation on body, query **and** path params; enums/strings only in Mongo filters (no objects from
  input → no `$` operator injection).
- Errors: no stack traces or internal messages to the client (`respondWithError` handles unknown errors).
- Secrets: never logged, returned or committed (`.env`, `backend/.env.local`, `deploy/.env`); mask
  connection strings with `sed -E 's#://[^@]*@#://***@#'`.
- User fields returned: through `publicUser()`; never `passwordHash`, tokens, other users' emails to
  non-admins.
- Rate limit present and sensible for anything that sends emails, calls the CoC API or accepts uploads.
- Uploads: type/size checked and re-encoded (`modules/bases/base-image.ts`); public image keys random.
- Frontend: no `[innerHTML]` with user/game text (names may contain anything), external links with
  `rel="noopener"`, new external hosts added to the CSP in `deploy/Caddyfile`.
- Report a vulnerability only with a concrete exploit path; otherwise a hardening note.
