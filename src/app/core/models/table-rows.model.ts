import { ClanRole, MemberLeague } from './clan.model';
import { CwlPlayerStats } from './cwl.model';
import { HistoryPlayerStats, HistoryWar, WarOutcome } from './history.model';
import { PlayerStats } from './player-stats.model';
import { RaidMember } from './raid.model';

/**
 * Rows of the tables filtered, sorted and paged by the backend (one route each), and what the
 * routes send besides the rows (`summary`).
 */

/** An ended war of the clan (`GET /wars/history`). */
export interface WarHistoryRow {
  /** War id (route of its detail). */
  id: string;
  /** End of the war. */
  date: string;
  opponent: string;
  opponentTag: string;
  teamSize: number;
  result: WarOutcome;
  stars: number;
  starsConceded: number;
  destruction: number;
  destructionConceded: number;
  /** Players and attacks are known (`false`: summary from the war log only). */
  hasDetails: boolean;
}

/** Record of every ended war (not only the matching ones). */
export interface WarHistorySummary {
  wars: number;
  victories: number;
  defeats: number;
  draws: number;
}

/** A member with their war statistics (`GET /players`). */
export interface MemberStatsRow extends Omit<PlayerStats, 'history' | 'league'> {
  role: ClanRole;
  /** `null` when unranked. */
  league: MemberLeague | null;
}

/** Averages over the matching members, for the footer. */
export type MemberStatsAverages = Pick<
  MemberStatsRow,
  | 'townHall'
  | 'warsPlayed'
  | 'attendance'
  | 'attacksUsed'
  | 'attacksAvailable'
  | 'totalStars'
  | 'averageStars'
  | 'threeStarRate'
  | 'averageDestruction'
  | 'defenses'
  | 'averageStarsConceded'
  | 'threeStarsConcededRate'
  | 'averageDestructionConceded'
>;

export interface MemberStatsSummary {
  /** Members of the clan (all, not only the matching ones). */
  members: number;
  /** Wars looked at (`0`: no war with players saved yet). */
  warsTotal: number;
  /** Leagues of the members, highest first. */
  leagues: { id: number; name: string }[];
  /** `null` when no member matches. */
  averages: MemberStatsAverages | null;
}

/** About every player of a war (`GET /wars/{id}/participants`). */
export interface ParticipantsSummary {
  /** Town halls in the war, highest first. */
  townHalls: number[];
}

/** A player in the ranking of a period (`GET /history/{period}/ranking`). */
export interface RankingRow extends HistoryPlayerStats {
  /** Position in the whole ranking (it does not change with the table filters). */
  rank: number;
  /** In a clan of the Crusade now. */
  isCurrentMember: boolean;
}

/** Who enters the ranking: it changes the positions too. */
export interface RankingOptions {
  minWars: number;
  currentMembersOnly: boolean;
}

/** A war of a period, without its players (`GET /history/{period}/wars`). */
export type PeriodWarRow = Omit<HistoryWar, 'players'>;

/** A player of a CWL season (`GET /cwl/seasons/{season}/players`). */
export interface CwlPlayerRow extends CwlPlayerStats {
  /** Position in the whole list. */
  index: number;
}

/** A member who attacked in a Raid Weekend (`GET /raids/seasons/{start}/members`). */
export interface RaidMemberRow extends RaidMember {
  /** Position in the whole list (most Capital Gold first). */
  rank: number;
}

/** Totals over the matching members, for the footer. */
export interface RaidMembersSummary {
  attacks: number;
  attackLimit: number;
  looted: number;
}
