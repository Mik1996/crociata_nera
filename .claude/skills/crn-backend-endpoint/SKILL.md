---
name: crn-backend-endpoint
description: Recipe to add or change a route of the Crociata Nera backend API (`backend/src/app/api/v1/**/route.ts`, Next.js route handlers) with everything the project requires — `apiHandler` options, rate limit, zod validation, `MessageKey`s translated in three languages, OpenAPI operation and response models, contract tests — and the matching frontend service methods. Use whenever an `/api/v1` route is created, changes its input, output, status codes, access or messages, or is removed.
---

# Backend endpoint (API design)

A route is not done until the OpenAPI document describes it exactly: `test/openapi.test.ts` fails for
an undocumented route, and every `call()` in the tests checks status, result shape (strict) and message
keys against the document (`test/contract.ts`).

## Design first

- **Path and method**: REST-ish nouns under `/api/v1`, kebab-case, path params in brackets
  (`wars/[warKey]`), actions as sub-resources (`base-proposals/[id]/approve`, `cwl/selection/[season]/close`).
- **Access** — exactly one level (details: `crn-access-control` skill):
  `public` | `user` (`auth: true`) | `clan` (`clanAccess: true`) | `leader` (`leaderAccess: true`) |
  `admin` (`roles: [UserRole.ADMIN]`). Clash of Clans data is always `clan`; a public page gets an ad-hoc
  route with only what it shows (like `GET /welcome`).
- **Result**: the smallest shape the page needs; CoC data in the official format only for the existing
  live routes (`/clan`, `/wars/current`, `/wars/warlog`, `/players/{tag}/profile`).
- **Errors**: one `MessageKey` per distinct user-facing reason; statuses 400 (validation), 403, 404,
  409 (state conflict / limit), 413, 502 (`COC_API_UNAVAILABLE` via `fromCocApi`).
- **Table data** (filter/sort/page)? Use the `crn-server-table` skill instead of a custom query format.

## Steps

1. **Logic** in `backend/src/modules/<area>/<x>.service.ts` (no HTTP types there); throw with
   `throwException(status, MessageKey.X)` or `throwException(status, [{ key, params }])`
   (`lib/http/api-error.ts`). Wrap CoC API reads in `fromCocApi` (`lib/coc/live-coc.ts`).
2. **Input schemas** in `modules/<area>/<x>.schemas.ts` (zod 4). Error messages are `MessageKey` values
   (`{ error: MessageKey.DESCRIPTION_IS_TOO_LONG }`); other issues become `ERROR.INVALID_FIELD`.
3. **Route** `backend/src/app/api/v1/<path>/route.ts`, modelled on `bases/[id]/route.ts`:
   ```ts
   export const PATCH = apiHandler<{ tag: string }, unknown, true>(
     { apiName: ApiName.X, roles: [UserRole.ADMIN] },
     async ({ request, params, user }) => {
       const { tag } = validate(z.object({ tag: playerTagParam }), params); // path params validated too
       const input = await parseBody(request, xSchema);                    // or parseQuery
       return { result: await doIt(user.id, tag, input), messages: [{ key: MessageKey.X_UPDATED }] };
     },
   );
   export const OPTIONS = preflight;
   ```
   (`playerTagParam` is in `modules/auth/auth.schemas.ts`; MongoDB ids are checked in the service with
   `Types.ObjectId.isValid` → 404, as `bases.service.ts` / `account.service.ts` do.)
   Doc comment above each export: `METHOD /api/v1/...`, who may call it, what it does.
   Return a `Response` only for binary content (images). `status: 201` for creations.
   `checkOrigin: true` on routes authenticated by the refresh cookie.
4. **Rate limit**: reuse a fitting `ApiName` or add one to the enum **and** `RATE_LIMITS`
   (`lib/http/api-name.ts`) with a comment justifying the numbers.
5. **Message keys**: new values in `lib/http/message-key.ts` (`ERROR.*` / `SUCCESS.*`) and their
   translations in `public/i18n/it-IT.json`, `en-US.json`, `es-ES.json` under `ERROR` / `SUCCESS`
   (the frontend `i18n.spec.ts` checks the three files have the same keys and placeholders).
6. **OpenAPI**:
   - response models as zod schemas in `backend/src/openapi/models/<area>.ts` (strict: every field the
     route returns, nothing more);
   - the operation in `backend/src/openapi/operations/<area>.ts` (`ApiOperation`: `method`, `path` with
     `{param}`, unique `operationId`, `tag`, `summary`, `description`, `access`, `rateLimit`, `params` /
     `query` / `body` via `requestPart(schema, fieldDocs)`, `responses`, `errors` by status). Common
     errors (401/403/429/400 validation/503/500) are added by the builder from `access` and the parts;
   - a new operations file must be added to `API_OPERATIONS` in `operations/index.ts`.
   Check it at `http://localhost:3001/api/v1/docs` when the backend runs.
7. **Tests** in `backend/test/<area>.test.ts` via `call()`: success, each documented error, access levels
   (`crn-testing-strategy`). Removing a route: delete its operation and tests too.
8. **Frontend**:
   - types in `src/app/core/backend/backend-api.types.ts`;
   - method on the service of the area (`core/backend/*.service.ts`, or `CocApiService` for clan data) and
     on its **mock** implementation when one exists (`core/mock/`, `core/api/mock-coc-api.service.ts`);
   - cache: GETs cached 15 min by default (`cacheFor(...)`, `noCache()` in `core/http/http-cache.ts`);
     successful writes clear cached GETs of the same API (`CACHE_INVALIDATES` for other prefixes);
   - errors shown with `backendErrors()` (`core/backend/backend-errors.ts`) / `<crn-form-errors>`;
   - private GET in the `clan-data` service-worker group (`ngsw-config.json`) only if cleared at sign-out.
9. **Docs**: README section of the area when behaviour visible to admins/users changed.

## Checks

```sh
cd backend && npm run typecheck && npx vitest run test/openapi.test.ts test/<area>.test.ts && npm test
npx tsc -p tsconfig.app.json --noEmit && npx ng test --watch=false
```

## Avoid

- Reading `request.json()`/`searchParams` directly, returning human-readable text, `any` results.
- Re-checking access inside the handler instead of the `apiHandler` option (ownership checks are the
  exception and belong in the service).
- Calling the CoC API per member per request; use `live-coc.ts` caches or saved data.
