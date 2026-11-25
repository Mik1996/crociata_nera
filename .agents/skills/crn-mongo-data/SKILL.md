---
name: crn-mongo-data
description: How to change persisted data in Crociata Nera safely — Mongoose 9 models and collections, indexes, unique keys that make syncs idempotent, startup data migrations in `backend/src/instrumentation.ts`, the Atlas databases `Prod` and `dev`, and the free-cluster limits. Use when adding or changing a model, field, index or collection, writing a migration, repairing saved documents, or checking data integrity.
---

# MongoDB data and migrations

Databases: Atlas cluster `crociata-nera-prod`, database `Prod` (VPS) and `dev` (local,
`backend/.env.local`). `DATABASE_URL` must name the database, otherwise MongoDB silently uses `test`.
Never print connection strings. To refresh `dev` from `Prod`, use the `crn-copy-prod-to-dev` skill.

## Model conventions (`backend/src/modules/<area>/<x>.model.ts`)

- Explicit PascalCase collection names: `{ collection: 'DefenseBases', timestamps: true, versionKey: false }`.
- Constants and enums of the domain live next to the model (`MAX_DEFENSE_BASES`, `BaseStatus`,
  `AnnouncementKind`) and are imported by schemas, OpenAPI and tests — one source.
- Indexes declared on the schema (`schema.index(...)`); Mongoose creates missing ones at startup
  (default `autoIndex`); tests call `syncIndexes()` before each test (`backend/test/setup.ts`).
  **Removing or changing** an index needs a migration that drops the old one (see
  `migrateCwlSeasonIndex` in `modules/cwl/cwl.model.ts`, `migrateCwlExclusionIndex`).
- Read paths use `.lean()`; writes that must not race use atomic conditional updates
  (`findOneAndUpdate` with the expected state in the filter — e.g. proposal review only matches
  `PENDING`, announcement publish `draft → publishing`, donation counters compare-and-set).

## Idempotence keys (do not break them)

| Collection | Key | Why |
|---|---|---|
| `Wars` | unique `warKey` = preparation start + opponent tag (`buildWarKey`, `modules/wars/wars.service.ts`) | same war read many times |
| `CwlSeasons` | unique `{clanTag, season}` | |
| `RaidSeasons` | unique `{clanTag, startTime}` | |
| `CommendationAwards` | unique `{periodKey, playerTag, commendationId}`; closed periods in `CommendationPeriods` | awarded once, frozen |
| `DonationTotals` | unique `{season, playerTag}` | |
| `CwlExclusions` | unique `{playerTag, season}` (`season: null` = until revoked) | |
| `Users.playerTags` | partial unique | one owner per game account |
| `DefenseBases.layoutId` | unique | same layout once |

## Migrations

Run at every backend start from `register()` in `backend/src/instrumentation.ts`, each in its own
`connectToDatabase().then(...).catch(log)` so one failure does not block the others. Rules:

1. **Idempotent**: filter only documents still in the old shape (`{ status: { $exists: false } }`),
   so the second run changes nothing. Log only when something changed: `[migrations] N … updated`.
2. Export it from the model file (`migrateBaseStatus` in `defense-base.model.ts` is the template);
   write through `Model.collection` when `timestamps` must not move.
3. Test it in the area's test file: old-shape documents inserted with `Model.collection.insertOne`,
   migration run twice, final state asserted.
4. Keep it until production has surely run it; removing it later is a separate, explicit change.
5. Data repairs of production (one-off fixes) are migrations too, never manual edits — ask the user first.

## Before changing a model

- Who reads it? grep the model name in `backend/src` and the field name in `src/app` (frontend types in
  `core/backend/backend-api.types.ts`) and `backend/src/openapi/models/`.
- Collections kept out of the dev copy: `DefenseBases`, `BaseImages`, `TelegramChats`, `TelegramBasePosts`,
  `Users`, `Sessions` (`KEEP_IN_DEV` in `backend/scripts/copy-prod-to-dev.mjs`) — a new collection holding
  secrets or dev-only state may need to join that list.
- Size: free Atlas cluster. Images live in MongoDB (`BaseImages`, max 400 bases); avoid storing raw API
  payloads indefinitely without need.
- Backups: `deploy/backup.sh` on the VPS (see README "Pubblicazione").

## Checks

`cd backend && npm run typecheck && npm test`; for a migration also start `npm run backend` on `dev` and
read the `[migrations]` lines (twice: second start must be silent).
