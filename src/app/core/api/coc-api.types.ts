/**
 * Types of the JSON responses of the official Clash of Clans API (https://api.clashofclans.com/v1).
 * Subset of the fields used by the app, aligned with the official definitions.
 * Used only by the mappers in `coc-api.mappers.ts`.
 */

export interface CocBadgeUrls {
  small?: string;
  medium?: string;
  large?: string;
}

/** Body of error responses (`ClientError`). */
export interface CocClientError {
  /** E.g. `accessDenied`, `accessDenied.invalidIp`, `notFound`, `requestThrottled`, `inMaintenance`. */
  reason: string;
  message?: string;
}

/** Item of `memberList` in `GET /clans/{clanTag}`. */
export interface CocClanMember {
  tag: string;
  name: string;
  role: 'leader' | 'coLeader' | 'admin' | 'member' | 'notMember';
  expLevel: number;
  townHallLevel?: number;
  trophies: number;
  builderBaseTrophies?: number;
  clanRank?: number;
  previousClanRank?: number;
  donations: number;
  donationsReceived: number;
}

/** `GET /clans/{clanTag}` */
export interface CocClan {
  tag: string;
  name: string;
  type?: 'open' | 'inviteOnly' | 'closed';
  description?: string;
  badgeUrls?: CocBadgeUrls;
  clanLevel: number;
  clanPoints?: number;
  warFrequency?: string;
  warWinStreak?: number;
  warWins?: number;
  warTies?: number;
  warLosses?: number;
  isWarLogPublic?: boolean;
  warLeague?: { id: number; name: string };
  members?: number;
  memberList?: CocClanMember[];
}

export interface CocWarAttack {
  attackerTag: string;
  defenderTag: string;
  stars: number;
  destructionPercentage: number;
  order: number;
  duration?: number;
}

export interface CocWarMember {
  tag: string;
  name: string;
  townhallLevel: number;
  mapPosition: number;
  attacks?: CocWarAttack[];
  opponentAttacks: number;
  bestOpponentAttack?: CocWarAttack;
}

export interface CocWarClan {
  tag: string;
  name: string;
  clanLevel: number;
  badgeUrls?: CocBadgeUrls;
  attacks: number;
  stars: number;
  destructionPercentage: number;
  members?: CocWarMember[];
}

/** `GET /clans/{clanTag}/currentwar` */
export interface CocWar {
  state: 'notInWar' | 'preparation' | 'inWar' | 'warEnded';
  teamSize?: number;
  attacksPerMember?: number;
  battleModifier?: 'none' | 'hardMode';
  /** API format: `20261105T120000.000Z`. */
  preparationStartTime?: string;
  startTime?: string;
  endTime?: string;
  clan?: CocWarClan;
  opponent?: CocWarClan;
}

/** Side in a war log entry (without members). */
export interface CocWarLogClan {
  /** Missing for League wars (CWL). */
  tag?: string;
  name?: string;
  badgeUrls?: CocBadgeUrls;
  clanLevel: number;
  attacks?: number;
  stars: number;
  destructionPercentage: number;
  expEarned?: number;
}

/** Entry of `GET /clans/{clanTag}/warlog`. */
export interface CocWarLogEntry {
  /** `null` for Clan War League entries. */
  result?: 'win' | 'lose' | 'tie' | null;
  endTime: string;
  teamSize: number;
  attacksPerMember?: number;
  battleModifier?: 'none' | 'hardMode';
  clan: CocWarLogClan;
  opponent: CocWarLogClan;
}

/** Paginated response of `GET /clans/{clanTag}/warlog`. */
export interface CocWarLog {
  items: CocWarLogEntry[];
  paging?: { cursors?: { before?: string; after?: string } };
}
