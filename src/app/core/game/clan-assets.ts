/**
 * Images of clan-level game objects (Supercell Fan Kit, in `public/game/`):
 * Capital Hall and District Halls by level, Clan Capital league badges and Clan War League trophies.
 */

const MAX_CAPITAL_HALL = 10;

/** Capital Hall picture for a level (1–10); `null` when the clan has no capital yet. */
export function capitalHallImage(level: number): string | null {
  if (!level || level < 1) return null;
  return `game/capital-halls/capital-hall-${Math.min(Math.round(level), MAX_CAPITAL_HALL)}.webp`;
}

/** Id of Capital Peak, the district whose hall is the Capital Hall itself. */
export const CAPITAL_PEAK_ID = 70000000;

const MAX_DISTRICT_HALL = 5;

/** District Hall picture for a level (1–5); `null` for a district without a hall level. */
export function districtHallImage(level: number): string | null {
  if (!level || level < 1) return null;
  return `game/capital-districts/district-hall-${Math.min(Math.round(level), MAX_DISTRICT_HALL)}.webp`;
}

const LEAGUE_TIERS = ['legend', 'titan', 'champion', 'master', 'crystal', 'gold', 'silver', 'bronze'] as const;
type LeagueTier = (typeof LEAGUE_TIERS)[number];

function tierOf(name: string | undefined): LeagueTier | null {
  const lower = name?.toLowerCase() ?? '';
  return LEAGUE_TIERS.find((tier) => lower.includes(tier)) ?? null;
}

/** Badge of a Clan Capital league ("Legend League", "Master League II"…). */
export function capitalLeagueIcon(name: string | undefined): string | null {
  const tier = tierOf(name);
  return tier ? `game/leagues/${tier}.webp` : null;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3 };
/** Clan War League tiers that have a trophy in the Fan Kit. */
const WAR_LEAGUE_TIERS: ReadonlySet<LeagueTier> = new Set(['champion', 'master', 'crystal', 'gold', 'silver', 'bronze']);

/** Trophy of a Clan War League ("Master League I" → master trophy with "I"). */
export function warLeagueIcon(name: string | undefined): string | null {
  const tier = tierOf(name);
  if (!tier || !WAR_LEAGUE_TIERS.has(tier)) return null;
  const division = ROMAN[name!.trim().split(/\s+/).pop()!.toUpperCase()] ?? 1;
  return `game/war-leagues/${tier}-${division}.webp`;
}
