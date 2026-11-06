/** Summary indicators of a war, computed client-side. */
export interface WarKpi {
  attacksAvailable: number;
  attacksUsed: number;
  averageStars: number;
  threeStarRate: number;
  /** Percentage of participants who used at least one attack. */
  participation: number;
  participantsWithoutAttacks: number;
}
