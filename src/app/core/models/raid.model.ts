/** A member's results in a Raid Weekend. */
export interface RaidMember {
  tag: string;
  name: string;
  attacks: number;
  /** Attacks available, bonus included (usually 6). */
  attackLimit: number;
  /** Capital Gold looted. */
  looted: number;
}

/** A Raid Weekend of the Clan Capital. */
export interface RaidSeason {
  /** Start time (ISO 8601), also used as id. */
  id: string;
  state: 'ongoing' | 'ended';
  startTime: string;
  endTime: string;
  totalLoot: number;
  raidsCompleted: number;
  totalAttacks: number;
  districtsDestroyed: number;
  offensiveReward: number;
  defensiveReward: number;
  /**
   * `false` when the member detail is not known: the API lists the members only while the
   * weekend is in progress, so past weekends have it only if the backend saved it in time.
   */
  hasMembers: boolean;
  /** Members who attacked, by Capital Gold looted (most first). */
  members: RaidMember[];
}
