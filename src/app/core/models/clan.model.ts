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
  /** Home village league, with its official icon. */
  league?: MemberLeague;
}

/** League of a member (`leagueTier`): the id also orders the leagues from lowest to highest. */
export interface MemberLeague {
  id: number;
  name: string;
  iconUrl?: string;
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
  /** Clan War League (e.g. `{ id: 48000015, name: 'Master League I' }`), if ranked. */
  warLeague?: ClanLeague;
  /** Clan Capital league (e.g. "Legend League"), if any. */
  capitalLeague?: string;
  /** Level of the Capital Hall (0 = no capital yet). */
  capitalHallLevel: number;
  clanPoints: number;
  capitalPoints: number;
  /** Country or region (e.g. "Italy"). */
  location?: string;
  /** Location id, for the location rankings. */
  locationId?: number;
  /** ISO country code, for the flag (e.g. "IT"). */
  countryCode?: string;
  chatLanguage?: string;
  /** Clan labels ("Clan Wars", "Friendly"…) with their official icons. */
  labels: ClanLabel[];
  type?: 'open' | 'inviteOnly' | 'closed';
  requiredTownHall?: number;
  requiredTrophies?: number;
  /** Minimum league to join (`requiredLeagueTier`), with its official icon. */
  requiredLeague?: { name: string; iconUrl?: string };
  members: ClanMember[];
}

/** League as returned by the API (`warLeague`): numeric id and English name. */
export interface ClanLeague {
  id: number;
  name: string;
}

export interface ClanLabel {
  name: string;
  iconUrl?: string;
}

/**
 * Position of the clan in the trophy rankings (`GET /locations/{id}/rankings/clans`).
 * The API only lists the top 200 clans: `null` = not in the top 200, `undefined` = not available.
 */
export interface ClanRanks {
  /** Ranking of the clan's country. */
  local?: number | null;
  /** Worldwide ranking. */
  global?: number | null;
}
