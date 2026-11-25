/** Monthly honours shown in the player banner (rules in `utils/commendations.ts`). */
export type CommendationType =
  | 'legendTop'
  | 'cwlAllAttacks'
  | 'perfectWar'
  | 'chiefHunter'
  | 'fortress'
  | 'champion'
  | 'perfect'
  | 'giantSlayer'
  | 'cwlStriker'
  | 'capitalRaider'
  | 'donor'
  | 'wall'
  | 'tireless'
  | 'present';

/** Commendations with a single medal of their own colour ({@link MedalStyle}), without tiers. */
export type SingleCommendationType = 'legendTop' | 'cwlAllAttacks' | 'perfectWar' | 'chiefHunter' | 'fortress';
/** Commendations with three tiers of increasing requirements. */
export type GradedCommendationType = Exclude<CommendationType, SingleCommendationType>;

/** Rank of a graded commendation; one-off commendations have none (`null`). */
export type CommendationTier = 'bronze' | 'silver' | 'gold';

/**
 * Look of a medal (flat colours, 3D metal, panels): the metal of its tier, or the colour of a one-off
 * commendation. A new colour needs its palette tokens (`--cn-medal-<style>`, `-light`, `-dark`,
 * `--cn-commendation-<style>-panel`), its 3D finish (`MEDAL_FINISHES`) and `$single-medal-styles`.
 */
export type MedalStyle = CommendationTier | 'crimson' | 'sapphire' | 'emerald' | 'pearl' | 'obsidian';

/**
 * Name of a medal image, `public/commendations/<name>.svg`: `<type>-<tier>`, or the type alone for a
 * one-off commendation.
 */
export type CommendationEmblem = `${GradedCommendationType}-${CommendationTier}` | SingleCommendationType;

/** A commendation earned in a month: only the highest tier reached is kept. */
export interface Commendation {
  type: CommendationType;
  /** `null` for a one-off commendation. */
  tier: CommendationTier | null;
}

/** The last processed Legend League season with the members among the first 10,000 of the world (`legendTop`). */
export interface LatestLegendSeason {
  /** As the Clash of Clans API names it (its end), e.g. `v2-2026-10-26T05:00:00Z`. */
  seasonId: string;
  endTime: string;
  results: { tag: string; name: string; clanTag: string; rank: number }[];
}

/** Periods the commendations refer to: each kind has its own. */
export interface CommendationPeriods {
  /** Month of the war commendations (`YYYY-MM`): the last completed month. */
  month: string;
  /** Last ended Raid Weekend (`capitalRaider`). */
  raidWeekend?: { startTime: string; endTime: string };
  /** Last ended Clan War League season, `YYYY-MM` (`cwlStriker`, `cwlAllAttacks`). */
  cwlSeason?: string;
  /** First battle day and end of the last war of that season. */
  cwlDates?: { startTime: string; endTime: string };
  /** Game season in progress, `YYYY-MM` (`donor`, awarded as soon as a tier is reached). */
  donationSeason?: string;
  /** Start and end of that season. */
  donationDates?: { startTime: string; endTime: string };
  /** Last processed Legend League season (`legendTop`). */
  legendSeason?: { seasonId: string; endTime: string };
}

/** Commendations earned by a player. */
export interface PlayerCommendations extends CommendationPeriods {
  items: Commendation[];
  /**
   * The one-off war commendations come from the last completed month and the one in progress: the
   * end (ISO time) of the war each one was last earned in.
   */
  warEnds?: Partial<Record<CommendationType, string>>;
}
