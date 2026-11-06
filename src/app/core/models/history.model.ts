/**
 * Monthly war history, produced by the proxy (`server/history.mjs`).
 * The JSON format matches these interfaces: no mapper needed.
 */

/** War outcome in the history (always an ended war). */
export type WarOutcome = 'victory' | 'defeat' | 'draw';

export interface HistoryAttack {
  stars: number;
  destruction: number;
  defenderTownHall: number | null;
  defenderPosition: number | null;
}

/** A player's performance in a history war. */
export interface HistoryWarPlayer {
  tag: string;
  name: string;
  townHall: number;
  mapPosition: number;
  attacksAvailable: number;
  attacks: HistoryAttack[];
  opponentAttacks: number;
  /** Stars of the best opponent attack received (0-3). */
  starsConceded: number;
}

/** Summary of a war recorded in the history. */
export interface HistoryWar {
  id: string;
  endTime: string;
  opponent: string;
  opponentTag: string;
  teamSize: number;
  attacksPerMember: number;
  result: WarOutcome;
  stars: number;
  starsConceded: number;
  destruction: number;
  destructionConceded: number;
  players: HistoryWarPlayer[];
}

/** Cumulative statistics of a player over a period (a month or all months). */
export interface HistoryPlayerStats {
  tag: string;
  name: string;
  townHall: number;
  lastWar: string;
  wars: number;
  attacksAvailable: number;
  attacksUsed: number;
  attacksMissed: number;
  stars: number;
  threeStars: number;
  twoStars: number;
  oneStar: number;
  zeroStars: number;
  /** Ranking criterion: stars / wars (max 6 with two attacks). */
  averageStarsPerWar: number;
  averageStarsPerAttack: number;
  threeStarRate: number;
  averageDestruction: number;
  /** Attacks used / attacks available (%). */
  participation: number;
  opponentAttacks: number;
  /** Average stars conceded on defence per war (0-3). */
  averageStarsConceded: number;
}

/** Data for a period: a month (`YYYY-MM`) or `all`. */
export interface HistoryPeriod {
  period: string;
  updatedAt: string | null;
  /** Most recent first. */
  wars: HistoryWar[];
  /** Already sorted by ranking. */
  players: HistoryPlayerStats[];
}

/** Entry in the list of available months. */
export interface MonthSummary {
  month: string;
  updatedAt: string;
  wars: number;
  victories: number;
  draws: number;
  defeats: number;
}
