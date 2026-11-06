/** Role of a member within the clan. */
export type ClanRole = 'leader' | 'coLeader' | 'elder' | 'member';

/** Clan member (profile data, not tied to a single war). */
export interface ClanMember {
  tag: string;
  name: string;
  role: ClanRole;
  townHall: number;
  expLevel: number;
  trophies: number;
  donations: number;
  donationsReceived: number;
}

/** General clan information. */
export interface Clan {
  tag: string;
  name: string;
  level: number;
  description: string;
  badgeUrl?: string;
  warWins: number;
  warLosses: number;
  warTies: number;
  warWinStreak: number;
  /** When false the API exposes neither the war log nor the current war. */
  isWarLogPublic: boolean;
  /** Clan war league (e.g. "Crystal League I"), if any. */
  warLeague?: string;
  members: ClanMember[];
}
