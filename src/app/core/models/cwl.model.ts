import { War, WarState } from './war.model';

/** State of a Clan War League season. */
export type CwlState = 'preparation' | 'inWar' | 'ended';

/** Saved season in the list (`GET /api/v1/cwl/seasons`). */
export interface CwlSeasonSummary {
  /** Season as `YYYY-MM`. */
  season: string;
  state: CwlState;
}

/** Position of a clan in the group standings. */
export interface CwlStanding {
  rank: number;
  tag: string;
  name: string;
  badgeUrl?: string;
  clanLevel: number;
  /** Stars, plus 10 for every war won (the game's rule). */
  stars: number;
  /** Sum of the destruction of every war. */
  destruction: number;
  wins: number;
  /** The clan of the site. */
  isOwn: boolean;
}

/** One of the 7 rounds, from the clan's point of view. */
export interface CwlRound {
  round: number;
  /** `null` while the round is not scheduled yet. */
  war: War | null;
  state: WarState | 'scheduled';
}

/** A player's results in the season (one attack per war in CWL). */
export interface CwlPlayerStats {
  tag: string;
  name: string;
  townHall: number;
  /** Wars in the line-up already started (= attacks available so far). */
  wars: number;
  attacks: number;
  stars: number;
  threeStars: number;
  /** Stars per attack used. */
  averageStars: number;
  /** Average destruction per attack used. */
  averageDestruction: number;
}

/** A Clan War League season: group standings, the clan's rounds and player statistics. */
export interface CwlSeason {
  /** `YYYY-MM`. */
  season: string;
  state: CwlState;
  standings: CwlStanding[];
  rounds: CwlRound[];
  /** Sorted by stars, then by average stars. */
  players: CwlPlayerStats[];
}
