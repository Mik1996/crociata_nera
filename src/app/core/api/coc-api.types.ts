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

export interface CocIconUrls {
  tiny?: string;
  small?: string;
  medium?: string;
  large?: string;
}

/** League, league tier or label, with its official icon. */
export interface CocNamedIcon {
  id: number;
  name: string;
  iconUrls?: CocIconUrls;
}

/** Hero, troop, spell or hero equipment of a player. */
export interface CocPlayerItem {
  name: string;
  level: number;
  maxLevel: number;
  village: 'home' | 'builderBase' | 'clanCapital';
  /** Only for super troops: whether it is currently boosted. */
  superTroopIsActive?: boolean;
  /** Only for heroes: equipment currently assigned. */
  equipment?: CocPlayerItem[];
}

export interface CocPlayerAchievement {
  name: string;
  stars: number;
  value: number;
  target: number;
  info: string;
  completionInfo?: string | null;
  village: 'home' | 'builderBase' | 'clanCapital';
}

export interface CocLegendSeason {
  id?: string;
  rank?: number;
  trophies: number;
}

/** `GET /players/{playerTag}` */
export interface CocPlayer {
  tag: string;
  name: string;
  townHallLevel: number;
  townHallWeaponLevel?: number;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  warStars: number;
  attackWins: number;
  defenseWins: number;
  builderHallLevel?: number;
  builderBaseTrophies?: number;
  bestBuilderBaseTrophies?: number;
  role?: CocClanMember['role'];
  warPreference?: 'in' | 'out';
  donations: number;
  donationsReceived: number;
  clanCapitalContributions?: number;
  clan?: { tag: string; name: string; clanLevel: number; badgeUrls?: CocBadgeUrls };
  league?: CocNamedIcon;
  leagueTier?: CocNamedIcon;
  builderBaseLeague?: { id: number; name: string };
  legendStatistics?: {
    legendTrophies?: number;
    currentSeason?: CocLegendSeason;
    previousSeason?: CocLegendSeason;
    bestSeason?: CocLegendSeason;
  };
  labels?: CocNamedIcon[];
  achievements?: CocPlayerAchievement[];
  heroes?: CocPlayerItem[];
  heroEquipment?: CocPlayerItem[];
  troops?: CocPlayerItem[];
  spells?: CocPlayerItem[];
}
