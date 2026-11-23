# Rules reference (verified against the code on 2026-11-23)

Values change: when this file and the code disagree, the code wins — fix this file.

## Monthly ranking (`backend/src/modules/wars/history.service.ts`)

- Period: month `YYYY-MM` of the war end in Europe/Rome, or `all`.
- Per player: `averageStarsPerWar = stars / wars` (max 6), `averageStarsPerAttack`, `threeStarRate`,
  `averageDestruction` (per attack), `participation = used / available %`,
  `averageStarsConceded = best opponent attack stars / wars`. Unused attacks count 0 stars.
- Order (`compareForRanking`, desc): `averageStarsPerWar` → `averageDestruction` → `participation` → `wars`.
- `RANKING_TABLE` options: `minWars` (1–100, default 1), `currentMembersOnly`; `rank` assigned after the
  options, before table filters.
- Only ended wars with participant details enter player stats; CWL wars never enter the monthly history.

## Member stats (`modules/wars/member-stats.table.ts`, `core/utils/war-stats.ts`)

- Window: last `STATS_WINDOW = 20` ended wars of the main clan (frontend `statsWindow`).
- Frontend "Rendimento" / efficiency = total stars / attacks available; `rankPerformers(minWars = 3)`.

## Commendations (`modules/commendations/commendation-rules.ts`)

Tiers checked in order `legendary, gold, silver, bronze`; `LOWER_IS_BETTER = {champion, wall}`.
Minimums: `MIN_WARS = 3`, `PERFECT_MIN_ATTACKS = 4`, `CWL_MIN_ATTACKS = 3`.

| Type | Period | Value | bronze / silver / gold | Ids |
|---|---|---|---|---|
| `champion` | month | ranking position (wars ≥ 3, stars > 0) | 3 / 2 / 1 | 95000001–03 |
| `perfect` | month | stars per attack (attacks ≥ 4) | 2.5 / 2.8 / 3 | 95000004–06 |
| `giantSlayer` | month | 3★ on a higher town hall | 2 / 5 / 10 | 95000007–09 |
| `cwlStriker` | CWL season | stars per attack (attacks ≥ 3) | 2.5 / 2.75 / 3 | 95000010–12 |
| `capitalRaider` | Raid Weekend | Capital Gold looted, strictly above | 25 000 / 27 500 / 30 000 | 95000013–15 |
| `wall` | month | avg stars conceded per war (wars ≥ 3, attacks received ≥ 3) | 2.8 / 2.5 / 2 | 95000016–18 |
| `tireless` | month | wars without missed attacks (no miss in the month) | 3 / 5 / 8 | 95000019–21 |
| `present` | month (≥ 3 clan wars) | % of clan wars with ≥ 1 attack | 50 / 75 / 100 | 95000022–24 |
| `donor` | Gold Pass season | troops donated | 5 000 / 7 500 / 10 000 | 95000025–27 |
| `cwlAllAttacks` | CWL season | every attack used, ≥ 3 days | legendary only | 95000028 |

Period keys: `month:YYYY-MM`, `raid:<startTime ISO>`, `cwl:YYYY-MM`, `donations:YYYY-MM`, plus
`@<clanTag>` for sister clans. A month closes ≥ 3 h after its end (`MONTH_CLOSE_GRACE_MS`) and only when
no war ending in it is still open; raids when ended with members saved; CWL when the season is ended.
`donor` is awarded live during the season, tiers only go up, frozen at season end.

## Clan records (`modules/records/clan-records.service.ts`)

Fields `perfectWars`, `warWinStreak`, `cwlLeague`, `localRank`, `localCapitalRank`, `capitalPoints`;
main clan seeded with `INITIAL_CLAN_RECORDS`, others `EMPTY_CLAN_RECORDS`. A perfect war is
`stars >= teamSize * 3`, counted once (`perfectCounted`). Ranks: lower is better, 0 = never ranked;
league: higher id is better.

## CWL standings (`core/utils/cwl.ts`)

Stars + `WIN_BONUS = 10` per win, then destruction; wars in preparation skipped.

## CWL line-up selection (`modules/cwl/cwl-selection.rules.ts`)

- `STARTERS = 15`, `RESERVES = 3`, eligible town hall ≥ max − `TOWN_HALL_GAP (1)` among the clans.
- `POINTS` (total 100): `cwlCommendations 12`, `cwlPerformance 13`, `war 40`, `heroes 20`, `townHall 10`,
  `league 5`.
- CWL commendations: `cwlAllAttacks 5` + `cwlStriker` bronze 3 / silver 5 / gold 7, scaled to 12.
- Attack quality = 0.8 × (stars/attack ÷ 3) + 0.2 × (destruction ÷ 100).
- CWL performance = 13 × quality × min(1, attacks / `CWL_FULL_CONFIDENCE_ATTACKS (3)`).
- Regular wars (last `WAR_WINDOW_DAYS = 90`): max × (0.75 quality + 0.25 participation) ×
  min(1, attacks / `WAR_FULL_CONFIDENCE_ATTACKS (8)`); players not in the last CWL get the CWL share added
  to the war maximum (`warPointsFor`).
- Heroes = 20 × (2/3 level ratio + 1/3 equipment ratio). Town hall: +10 only at the highest town hall.
  League: `id − 105_000_030` clamped 0–5.
- Penalties: missed attacks −3 each up to −15; newcomer −5 when role is exactly `member` and joined
  < 14 days ago (elders and above exempt). Score clamped 0–100.
- Order (`rankCandidates`): eligible first → score → town hall → league id → role → name.
- Statuses: `starter`, `reserve`, `bench`, `ineligible`, `excluded` (stays ranked, takes no slot).
- Lifecycle: one `CwlSelections` document per season; the open one is the first month whose CWL has not
  started; closed by an admin or automatically when the main clan's `CwlSeason` appears (ranking frozen,
  `lineup` announcement draft, next season opened); reopen only while its CWL has not started and no later
  season is closed. Exclusions: one season or `season: null` (until revoked).

## Donations (`modules/donations/donation.service.ts`)

Season id = `YYYY-MM` of the Gold Pass season's midpoint. Each read adds the counter growth since the
last read; a lower counter (reset) or a read from an earlier season adds the whole counter. Players
leaving: counter reset to 0 unless their clan could not be read. Commendations use all clans' totals;
pages show the main clan.
