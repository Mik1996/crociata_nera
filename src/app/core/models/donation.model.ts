/** Troops donated by a player during a game season, as counted by the backend. */
export interface DonationPlayer {
  tag: string;
  name: string;
  donations: number;
}

/**
 * A game season (Gold Pass season) with the donations of each player. The backend adds up the
 * in-game counter between reads, so the troops donated before leaving the clan are kept.
 */
export interface DonationSeason {
  /** `YYYY-MM`. */
  season: string;
  startTime: string;
  endTime: string;
  state: 'ongoing' | 'ended';
  /** Most donations first. */
  players: DonationPlayer[];
}
