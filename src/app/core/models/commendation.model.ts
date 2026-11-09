/** Monthly honours shown in the player banner (rules in `utils/commendations.ts`). */
export type CommendationType =
  | 'cwlAllAttacks'
  | 'champion'
  | 'perfect'
  | 'giantSlayer'
  | 'cwlStriker'
  | 'capitalRaider'
  | 'donor'
  | 'wall'
  | 'tireless'
  | 'present';

/**
 * Most commendations have three tiers with increasing requirements; a one-off commendation of
 * the highest merit has the single `legendary` tier.
 */
export type CommendationTier = 'bronze' | 'silver' | 'gold' | 'legendary';

/** Name of a medal image: `public/commendations/<type>-<tier>.svg`. */
export type CommendationEmblem = `${CommendationType}-${CommendationTier}`;

/** A commendation earned in a month: only the highest tier reached is kept. */
export interface Commendation {
  type: CommendationType;
  tier: CommendationTier;
}

/** Periods the commendations refer to: each kind has its own. */
export interface CommendationPeriods {
  /** Month of the war commendations (`YYYY-MM`): the last completed month. */
  month: string;
  /** Last ended Raid Weekend (`capitalRaider`). */
  raidWeekend?: { startTime: string; endTime: string };
  /** Last ended Clan War League season, `YYYY-MM` (`cwlStriker`, `cwlAllAttacks`). */
  cwlSeason?: string;
  /** Last ended game season, `YYYY-MM` (`donor`). */
  donationSeason?: string;
}

/** Commendations earned by a player. */
export interface PlayerCommendations extends CommendationPeriods {
  items: Commendation[];
}
