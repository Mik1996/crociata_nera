import { ClanRole, MemberLeague } from './clan.model';
import { WarResult } from './war.model';

/** A player's performance in a single war. */
export interface WarPerformance {
  warId: string;
  date: string;
  opponent: string;
  result: WarResult;
  townHall: number;
  mapPosition: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  averageDestruction: number;
}

/** A player's aggregated war statistics. */
export interface PlayerStats {
  tag: string;
  name: string;
  role: ClanRole;
  townHall: number;
  league?: MemberLeague;
  trophies: number;
  /** Wars in which the player was lined up. */
  warsPlayed: number;
  /** Wars analysed (reference window). */
  warsTotal: number;
  /** Attendance percentage (warsPlayed / warsTotal). */
  attendance: number;
  attacksAvailable: number;
  attacksUsed: number;
  totalStars: number;
  averageStars: number;
  /** Percentage of 3-star attacks out of all attacks used. */
  threeStarRate: number;
  averageDestruction: number;
  /** Chronological history (from the oldest war to the most recent). */
  history: WarPerformance[];
}
