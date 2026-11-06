/** A single attack performed during a war. */
export interface Attack {
  attackerTag: string;
  defenderTag: string;
  /** Stars earned (0-3). */
  stars: number;
  /** Destruction percentage (0-100). */
  destructionPercentage: number;
  /** Chronological order of the attack within the war. */
  order: number;
  /** Attack duration in seconds. */
  durationSeconds: number;
}
