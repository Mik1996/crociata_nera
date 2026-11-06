import { WarParticipant } from './war-participant.model';

export type WarState = 'preparation' | 'battle' | 'ended';

export type WarResult = 'victory' | 'defeat' | 'draw' | 'ongoing';

/** One of the two sides of a war. */
export interface WarClan {
  tag: string;
  name: string;
  level: number;
  badgeUrl?: string;
  stars: number;
  destructionPercentage: number;
  attacksUsed: number;
  members: WarParticipant[];
}

/** Clan war. */
export interface War {
  /** Stable war identifier (used in routes). */
  id: string;
  state: WarState;
  /** Start of the preparation day (ISO 8601). */
  preparationStartTime: string;
  /** Start of the battle (ISO 8601). */
  startTime: string;
  /** End of the battle (ISO 8601). */
  endTime: string;
  /** Number of players per side (e.g. 15 vs 15). */
  teamSize: number;
  attacksPerMember: number;
  /**
   * `true` when participants and attacks are known (current war or archived by the proxy).
   * `false` for wars known only from the API war log, which provides only the summary:
   * in that case `members` is empty and `startTime`/`preparationStartTime` are estimated
   * from the end time.
   */
  hasDetails: boolean;
  clan: WarClan;
  opponent: WarClan;
}
