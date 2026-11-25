---
name: crn-clan-statistics
description: The scoring and ranking rules of Crociata Nera — monthly war ranking, player statistics and KPIs, commendations (medals) and their freezing, clan records, CWL standings and the CWL line-up selection score, Raid Weekend and donation totals — with the files that implement each rule and the twins that must stay equal between backend and frontend. Use when changing or adding a metric, ranking, commendation, record or selection criterion, or when a number on the site looks wrong.
---

# Clan statistics, rankings and commendations

The exact values (thresholds, points, ids) are in [rules-reference.md](rules-reference.md); read it
when you touch a rule. User-facing definitions are in README "Definizioni delle metriche" and
"Storico mensile e classifica" (Italian) — update them when a definition changes.

## Where each rule lives

| Area | Backend (source of truth) | Frontend twin / consumer |
|---|---|---|
| Monthly history and ranking order | `backend/src/modules/wars/history.service.ts` (`aggregatePlayers`, `compareForRanking`, months in Europe/Rome) + tables in `history.tables.ts` (`RANKING_TABLE`) | `src/app/core/utils/monthly-history.ts` (same `compareForRanking`) |
| Member stats (last 20 wars) | `modules/wars/member-stats.table.ts` (`STATS_WINDOW`) | `core/utils/war-stats.ts` (`computePlayerStats`, KPIs, `rankPerformers`), `statsWindow` in app config |
| Commendations | `modules/commendations/commendation-rules.ts` (catalogue, thresholds, award functions) + `commendation-sync.service.ts` (periods, freezing) | `core/utils/commendations.ts` (same constants and logic, emblem ids `<type>-<tier>` or the type of a one-off medal, `styleOf`), medals in `public/commendations/` |
| Clan records | `modules/records/clan-records.service.ts` | welcome page (`GET /clan/records`) |
| CWL standings | saved group and wars (`modules/cwl/cwl.service.ts`, `cwl-sync.service.ts`) | computed in the browser: `core/utils/cwl.ts` (`buildCwlSeason`, `WIN_BONUS`) |
| CWL line-up selection | `modules/cwl/cwl-selection.rules.ts` (pure) + `cwl-selection.service.ts` (lifecycle) | `features/cwl-selection/` (shows, never computes) |
| Raid Weekend | `modules/raids/raid-members.table.ts` | `core/utils/cwl.ts` (`mapRaidSeason`), `features/raids/` |
| Donations | `modules/donations/donation.service.ts` (`recordDonations`, counter growth per Gold Pass season) | statistics/players pages |

**Twins must change together** (same commit, both tested): commendation constants and award logic,
ranking comparator, the stats window. Grep the constant name in both `backend/src` and `src/app`.

## Changing a rule safely

1. Locate the rule (table above) and its tests (`backend/test/commendations.test.ts`, `history.test.ts`,
   `cwl-selection.test.ts`, `records.test.ts`, `donations.test.ts`; frontend
   `core/utils/*.spec.ts`).
2. Decide what happens to the past:
   - **Commendations are frozen** per closed period (`CommendationPeriods`): a new rule applies only to
     periods closed after the deploy; recomputing the past needs an explicit decision and a migration.
   - **Commendation ids never change and are never reused** (`COMMENDATION_IDS`); a new kind or tier gets
     new ids, a new emblem SVG and i18n texts.
   - **Closed CWL selections keep their frozen ranking**; only the open one follows the new formula.
   - **Records** only improve (`improveRecord`, `improveLeague`); lowering one needs a data repair.
3. Update both twins, the README definition, the i18n texts explaining the rule (commendation dialog,
   selection page legend), and the OpenAPI model if a field changes.
4. Tests: boundary values of each threshold (just below / at / above; `STRICTLY_ABOVE` kinds), minimums
   (`MIN_WARS`, `PERFECT_MIN_ATTACKS`, `CWL_MIN_ATTACKS`), ties in the ranking, sister-clan period keys
   (`@<tag>`), Europe/Rome month boundaries.

## Adding a commendation kind (checklist)

`CommendationType` + `COMMENDATION_TYPES` + `COMMENDATION_THRESHOLDS` + `COMMENDATION_IDS` (new ids) in
`commendation-rules.ts`; award function and the period it closes on in `commendation-sync.service.ts`;
frontend twin in `core/utils/commendations.ts`; emblem SVGs `public/commendations/<type>-<tier>.svg`;
**one-off kind** (a single medal of its own colour, `tier: null`): `SingleCommendationType` + `SINGLE_COMMENDATIONS`
(threshold and id in the backend, threshold and `style` in the frontend), image `public/commendations/<type>.svg`, i18n
`commendations.<type>.name`; a **new colour** (`MedalStyle`) needs `--cn-medal-<style>`/`-light`/`-dark` and
`--cn-commendation-<style>-panel` in the palette, a 3D finish in `MEDAL_FINISHES` and `$single-medal-styles`;
i18n (name, description, how to earn) in three files; medal look (`shared/medal-3d/` if per-kind); the
`LOWER_IS_BETTER` set when relevant; tests both sides. Announcements and the CWL selection score read some
kinds (`COMMENDATION_POINTS`): check them.

## When a number looks wrong

Compare the backend computation (route response) with the frontend twin for the same data; then check
the inputs: wars with summary only (excluded from player stats), CWL wars (not in the monthly history),
wars still in preparation, players who left (`currentMembersOnly`), donation counter resets.
