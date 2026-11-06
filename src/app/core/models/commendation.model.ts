/** Monthly honours shown in the player banner (rules in `utils/commendations.ts`). */
export type CommendationType = 'champion' | 'perfect' | 'giantSlayer' | 'wall' | 'tireless' | 'present';

/** Each commendation has three tiers with increasing requirements. */
export type CommendationTier = 'bronze' | 'silver' | 'gold';

/** Name of a medal image: `public/commendations/<type>-<tier>.svg`. */
export type CommendationEmblem = `${CommendationType}-${CommendationTier}`;

/** A commendation earned in a month: only the highest tier reached is kept. */
export interface Commendation {
  type: CommendationType;
  tier: CommendationTier;
}

/** Commendations earned by a player in a month. */
export interface PlayerCommendations {
  /** Month the commendations refer to (`YYYY-MM`). */
  month: string;
  items: Commendation[];
}
