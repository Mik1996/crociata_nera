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
  capitalLeague?: { id: number; name: string };
  clanCapital?: { capitalHallLevel?: number };
  clanCapitalPoints?: number;
  clanBuilderBasePoints?: number;
  location?: { id: number; name: string; isCountry?: boolean; countryCode?: string };
  chatLanguage?: { id: number; name: string; languageCode?: string };
  labels?: { id: number; name: string; iconUrls?: { small?: string; medium?: string } }[];
  requiredTownhallLevel?: number;
  requiredLeagueTier?: { id: number; name: string; iconUrls?: { large?: string; small?: string } };
  requiredTrophies?: number;
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

// ---------------------------------------------------------------------------
// Other endpoints of the official API (used through `CocApiClient`)
// ---------------------------------------------------------------------------

/** Cursors of a paginated list: pass `after`/`before` back to get the next/previous page. */
export interface CocPaging {
  cursors?: { before?: string; after?: string };
}

/** Paginated list (`ClanList`, `PlayerRankingList`, `LeagueList`…). */
export interface CocList<T> {
  items: T[];
  paging?: CocPaging;
}

/** Pagination query parameters of the list endpoints. */
export interface CocPageQuery {
  /** Items per page. */
  limit?: number;
  /** Cursor of the next page (`paging.cursors.after`). */
  after?: string;
  /** Cursor of the previous page (`paging.cursors.before`). */
  before?: string;
}

/** Filters of `GET /clans` (at least one filter is required by the API). */
export interface CocClanSearchQuery extends CocPageQuery {
  /** At least 3 characters. */
  name?: string;
  warFrequency?: 'always' | 'moreThanOncePerWeek' | 'oncePerWeek' | 'lessThanOncePerWeek' | 'never' | 'unknown';
  locationId?: number;
  minMembers?: number;
  maxMembers?: number;
  minClanPoints?: number;
  minClanLevel?: number;
  /** Up to 3 label ids. */
  labelIds?: number[];
}

/** League (home village, war, capital, builder base) or league tier: id, name and icons. */
export interface CocLeague {
  id: number;
  name: string;
  iconUrls?: CocIconUrls;
}

/** Legend League season (`GET /leagues/{leagueId}/seasons`): id `YYYY-MM`. */
export interface CocLeagueSeason {
  id: string;
}

/** `GET /locations` and `GET /locations/{locationId}`. */
export interface CocLocation {
  id: number;
  name: string;
  isCountry: boolean;
  countryCode?: string;
  localizedName?: string;
}

/** Clan summary inside rankings and leagues. */
export interface CocClanSummary {
  tag: string;
  name: string;
  badgeUrls?: CocBadgeUrls;
}

/** Home village player ranking (location rankings and Legend League seasons). */
export interface CocPlayerRanking {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  attackWins: number;
  defenseWins: number;
  rank: number;
  previousRank?: number;
  clan?: CocClanSummary;
  league?: CocLeague;
  leagueTier?: CocLeague;
}

/** Builder base player ranking. */
export interface CocPlayerBuilderBaseRanking {
  tag: string;
  name: string;
  expLevel: number;
  builderBaseTrophies: number;
  rank: number;
  previousRank?: number;
  clan?: CocClanSummary;
  builderBaseLeague?: CocLeague;
}

/** Clan ranking (home village, builder base and capital rankings share these fields). */
export interface CocClanRanking {
  tag: string;
  name: string;
  location?: CocLocation;
  badgeUrls?: CocBadgeUrls;
  clanLevel: number;
  members: number;
  rank: number;
  previousRank?: number;
  /** Home village ranking. */
  clanPoints?: number;
  /** Builder base ranking. */
  clanBuilderBasePoints?: number;
  /** Capital ranking. */
  clanCapitalPoints?: number;
}

/** `GET /clans/{clanTag}/currentwar/leaguegroup`: the Clan War League group of the season. */
export interface CocClanWarLeagueGroup {
  tag?: string;
  state: 'groupNotFound' | 'notInWar' | 'preparation' | 'war' | 'inWar' | 'ended';
  /** Season, e.g. `2026-11-01`. */
  season: string;
  clans: (CocClanSummary & {
    clanLevel: number;
    members: { tag: string; name: string; townHallLevel: number }[];
  })[];
  /** One entry per round; `#0` marks wars not scheduled yet. */
  rounds: { warTags: string[] }[];
}

/** Participant of a Raid Weekend. */
export interface CocCapitalRaidMember {
  tag: string;
  name: string;
  attacks: number;
  attackLimit: number;
  bonusAttackLimit: number;
  capitalResourcesLooted: number;
}

/** Attack or defense against one clan during a Raid Weekend. */
export interface CocCapitalRaidLog {
  attacker?: CocClanSummary & { level: number };
  defender?: CocClanSummary & { level: number };
  attackCount: number;
  districtCount: number;
  districtsDestroyed: number;
}

/** `GET /clans/{clanTag}/capitalraidseasons`: one Raid Weekend. */
export interface CocCapitalRaidSeason {
  state: 'ongoing' | 'ended';
  /** API format: `20261106T070000.000Z`. */
  startTime: string;
  endTime: string;
  capitalTotalLoot: number;
  raidsCompleted: number;
  totalAttacks: number;
  enemyDistrictsDestroyed: number;
  offensiveReward: number;
  defensiveReward: number;
  members?: CocCapitalRaidMember[];
  attackLog: CocCapitalRaidLog[];
  defenseLog: CocCapitalRaidLog[];
}

/** War of the Clan War League (`GET /clanwarleagues/wars/{warTag}`): a war plus its start date. */
export interface CocClanWarLeagueWar extends CocWar {
  warStartTime?: string;
}

/** Amount of a resource (`Gold`, `Elixir`, `DarkElixir`…) in a battle. */
export interface CocResourceAmount {
  name: string;
  amount: number;
}

/** Entry of `GET /players/{playerTag}/battlelog`: a recent multiplayer battle (attack or defense). */
export interface CocBattleLogEntry {
  /** E.g. `homeVillage`, `legend`. */
  battleType: string;
  /** `true` = the player attacked, `false` = the player was attacked. */
  attack: boolean;
  /** Army link code of the attacker. */
  armyShareCode?: string;
  opponentPlayerTag: string;
  opponentName: string;
  opponentTownHallLevel: number;
  stars: number;
  destructionPercentage: number;
  lootedResources: CocResourceAmount[];
  extraLootedResources: CocResourceAmount[];
  availableLoot: CocResourceAmount[];
  /** Battle duration in seconds. */
  battleTime: number;
  /** API format: `20261102T201436.000Z`. */
  battleTimestamp: string;
}

/** Entry of `GET /players/{playerTag}/leaguehistory`: the player's result in a past league season. */
export interface CocLeagueHistoryEntry {
  /** Season id (Unix timestamp in seconds), usable with `/leaguegroup/{tag}/{leagueSeasonId}`. */
  leagueSeasonId: number;
  leagueTrophies: number;
  leagueTierId: number;
  placement: number;
  attackWins: number;
  attackLosses: number;
  attackStars: number;
  defenseWins: number;
  defenseLosses: number;
  defenseStars: number;
  maxBattles: number;
}

/** `GET /goldpass/seasons/current` */
export interface CocGoldPassSeason {
  /** API format: `20261101T080000.000Z`. */
  startTime: string;
  endTime: string;
}

/** Clan or player label (`GET /labels/clans`, `GET /labels/players`). */
export interface CocLabel {
  id: number;
  name: string;
  iconUrls?: CocIconUrls;
}

/**
 * Response whose schema is not published yet (`/leaguegroup/{leagueGroupTag}/{leagueSeasonId}`):
 * kept as a generic object until the app uses it and its fields can be typed.
 */
export type CocUntypedResponse = Record<string, unknown>;
