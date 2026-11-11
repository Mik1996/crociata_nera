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

/** A district of the Clan Capital, with the level of its hall. */
export interface CapitalDistrict {
  id: number;
  /** Name as the API gives it, in English ("Barbarian Camp"). */
  name: string;
  /** Level of the District Hall (of the Capital Hall, for Capital Peak). */
  level: number;
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
  /** Districts of the capital the clan has unlocked, Capital Peak first. */
  capitalDistricts: CapitalDistrict[];
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

/** A best value of the clan; `achievedAt` is `null` for records reached before the backend tracked them. */
export interface ClanRecord {
  value: number;
  achievedAt: string | null;
}

/** All-time records of the clan, kept by the backend (`GET /api/v1/clan/records`). */
export interface ClanRecords {
  /** Wars won with every star. */
  perfectWars: ClanRecord;
  /** Longest series of consecutive war wins. */
  warWinStreak: ClanRecord;
  /** Highest Clan War League reached (English name from the API). */
  cwlLeague: { id: number; name: string; achievedAt: string | null };
  /** Best position in the clan rankings of the clan's country. */
  localRank: ClanRecord;
  /** Best position in the Clan Capital rankings of the clan's country. */
  localCapitalRank: ClanRecord;
  /** Most Clan Capital trophies. */
  capitalPoints: ClanRecord;
}
