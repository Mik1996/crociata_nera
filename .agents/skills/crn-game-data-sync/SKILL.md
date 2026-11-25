---
name: crn-game-data-sync
description: How Crociata Nera reads the Clash of Clans API and keeps its own history — the CoC client and live caches, the war-sync scheduler and its ordered steps (wars, CWL, CWL selections, raids, records, commendations, legends, announcement drafts, profiles, donations), per-clan loops over Nera/Rossa/d'Oro, health status and the cron route. Use when adding a new datum from the CoC API, a new scheduled step, changing sync timing, or when saved data is missing, stale or duplicated.
---

# Clash of Clans data and the scheduler

Principle (`AGENTS.md`): every CoC datum reaches the frontend through `/api/v1`, never from the
official API; the API is GET-only except `verifytoken`. API gotchas are listed in `AGENTS.md`
"Backend notes" — read them before trusting a field.

## Reading the API

- `backend/src/lib/coc/coc-client.ts`: `cocGet`/`cocPost` and typed fetchers (`fetchClan`,
  `fetchCurrentWar`, `fetchWarLog`, `fetchLeagueGroup`, `fetchLeagueWar`, `fetchRaidSeasons`,
  `fetchClanRankings`, …); failures are `CocApiError` (status + reason such as `accessDenied`,
  `notFound`, `inMaintenance`).
- `backend/src/lib/coc/live-coc.ts`: reads made on a page request, cached in memory
  (`LIVE_TTL_MS`: clan 1 min, current war 30 s, war log 5 min, player 10 min, raids 1 min, rankings
  10 min) via `cachedRead` (`live-cache.ts`). Wrap route reads in `fromCocApi(...)` → 502
  `COC_API_UNAVAILABLE`. A new live read gets its own TTL entry and cache key.
- The three clans: `backend/src/lib/coc/crusade-clans.ts` (`CRUSADE_CLAN_TAGS`, `primaryClanTag()` from
  `CLAN_TAG`, `crusadeClanTags()` main first, `periodSuffix(clanTag)` → `''` or `@<tag>`). Pages show
  the main clan; most data is saved for all three (wars, CWL, raids, rosters, donations, commendations,
  records, announcements).

## The scheduler (`backend/src/lib/scheduler/war-sync-scheduler.ts`)

Started from `backend/src/instrumentation.ts`. `runWarSync()` runs these steps in order, each in its
own `try/catch` so one failure never stops the others:

1. `runDonationRead` (only shortly before a Gold Pass season ends)
2. `runMainClanWarSync` → `modules/wars/war-sync.service.ts` (`/currentwar`, saved under `warKey`)
3. `runOtherClansWarSync`
4. `runCwlSync` → `modules/cwl/cwl-sync.service.ts` (all clans)
5. `runSelectionSync` → closes the CWL selection when the main clan's season appears
6. `runRaidSync` → `modules/raids/raid-sync.service.ts` (members only while the weekend is ongoing)
7. `runRecordSync` → `modules/records/clan-records.service.ts`
8. `runCommendationSync` → `modules/commendations/commendation-sync.service.ts`
9. `runLegendSeasonSync` → `modules/legends/legend-season.service.ts`
10. `runAnnouncementDrafts` → `modules/announcements/announcement-drafts.service.ts`
11. `runProfileSync` → `modules/commendations/player-profile-sync.service.ts`

Timing: every `WAR_SYNC_INTERVAL_MINUTES` (default 10, `0` disables; `lib/config/env.ts`), brought forward
to the next war end, raid check, season end or legend check (never under 30 s); a run times out after
15 min. `SYNC_JOBS` (`warSync`, `cwl`, `raids`, `donations`, `commendations`, `profiles`) track last
success/failure, exposed by `GET /api/v1/health` (`warSyncStatus`). `POST /api/v1/cron/war-sync` with
`CRON_SECRET` triggers a run from outside.

## Adding a step or a new saved datum

1. Service in `modules/<area>/<x>-sync.service.ts`: reads the API, upserts by a natural unique key
   (`crn-mongo-data` skill), returns a small report (`error`, `nextCheckAt`) instead of throwing for API
   errors.
2. Loop over `crusadeClanTags()` unless the datum is main-clan only; suffix period keys with
   `periodSuffix`.
3. Add a `runX` in the scheduler at the right place in the order (data before what derives from it:
   records/commendations/announcements come after the syncs they read), with `console.warn/error`
   prefixed `[x-sync]`, and `track()` if it deserves a health entry (extend `SYNC_JOBS`; the health model
   in `backend/src/openapi/models/system.ts` must follow).
4. If something must happen at a precise time (season end), return a check time and let the scheduler
   wake up for it, as raids/legends do.
5. Tests: `backend/test/scheduler.test.ts` for wiring, the area's test for the service with `mockCocApi`
   (happy path, API error, second run = no change, sister clan).
6. Never derive history from a single read when it can be missed: data the API shows only for a while
   (war details until `warEnded`, raid members during the weekend, Legend country ranking before reset)
   needs a read in that window and must be kept once saved.

## Diagnosing missing or wrong data

- `GET /api/v1/health` (jobs and last error) and backend logs (`[war-sync]`, `[raid-sync]`, …).
- Was the backend running during the window the API exposed the datum? (README "Da dove arriva lo storico").
- Private war log (`accessDenied`), maintenance (`inMaintenance`), key bound to another IP
  (`accessDenied.invalidIp`): see README "Casi particolari".
- Duplicates → broken unique key; stale → frozen period or cache TTL (backend `LIVE_TTL_MS`, frontend
  `cacheFor`, service worker).
