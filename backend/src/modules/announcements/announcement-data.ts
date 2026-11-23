import { CRUSADE_CLAN_NAMES, periodSuffix, primaryClanTag } from '@/lib/coc/crusade-clans';
import { CommendationAwardModel } from '@/modules/commendations/commendation-award.model';
import {
  COMMENDATION_TYPES,
  commendationName,
  CommendationTier,
  CommendationType,
  medalsOf,
  MIN_WARS,
} from '@/modules/commendations/commendation-rules';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { DonationTotalModel } from '@/modules/donations/donation.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { compareForRanking, getPeriod, HistoryPeriod, monthBounds } from '@/modules/wars/history.service';

/** Players awarded one commendation in the period (`times` > 1: earned in more Raid Weekends). */
export interface Honour {
  type: CommendationType;
  /** `null` for a one-off commendation. */
  tier: CommendationTier | null;
  players: { name: string; times: number }[];
}

interface ClanPart {
  clanTag: string;
  clanName: string;
}

export interface MonthData extends ClanPart {
  kind: 'month';
  month: string;
  wars: {
    total: number;
    victories: number;
    draws: number;
    defeats: number;
    stars: number;
    averageStars: number;
    averageDestruction: number;
    threeStarRate: number;
    attacksUsed: number;
    attacksMissed: number;
  } | null;
  raids: { weekends: number; capitalGold: number; attacks: number } | null;
  /** First of the month's ranking (average stars per war, at least 3 wars). */
  mvp: { name: string; averageStars: number; wars: number } | null;
  honours: Honour[];
}

export interface CwlData extends ClanPart {
  kind: 'cwl';
  season: string;
  /** Place in the group (1–8); `null` if the standings cannot be computed. */
  rank: number | null;
  clans: number;
  wins: number;
  draws: number;
  losses: number;
  /** Stars of the clan, with the 10 bonus stars of every win (as in the standings). */
  stars: number;
  /**
   * Best attackers: of the players with the most attacks, those with the most stars (all of them
   * when tied, by name). `null` when nobody attacked.
   */
  bestAttackers: { names: string[]; stars: number; attacks: number } | null;
  honours: Honour[];
}

export interface DonationsData extends ClanPart {
  kind: 'donations';
  season: string;
  total: number;
  top: { name: string; donations: number }[];
  honours: Honour[];
}

export const RECORD_NAMES = ['perfectWars', 'warWinStreak', 'cwlLeague', 'localRank', 'localCapitalRank', 'capitalPoints'] as const;
export type RecordName = (typeof RECORD_NAMES)[number];

export interface RecordData extends ClanPart {
  kind: 'record';
  record: RecordName;
  /** New value (league id for `cwlLeague`; position for the rankings). */
  value: number;
  /** Value it beats; `null` when there was none (first time in a ranking). */
  previous: number | null;
  /** `cwlLeague`: name of the league reached and of the one before. */
  leagueName?: string;
  previousLeagueName?: string | null;
}

/** A home village league (`leagueTier`): the id grows with the league. */
export interface LeagueTier {
  id: number;
  /** English, as the API writes it (`Electro League 32`, `Legend League III`). */
  name: string;
}

export interface PromotionData extends ClanPart {
  kind: 'promotion';
  playerTag: string;
  playerName: string;
  /** League reached. */
  league: LeagueTier;
  /** Highest league before (`null`: unknown). */
  previousLeague: LeagueTier | null;
}

/** A member who ended a Legend League season in Legend League I (first 10,000 of the world). */
export interface LegendSeasonData extends ClanPart {
  kind: 'legendSeason';
  playerTag: string;
  playerName: string;
  /** `v2-2026-11-23T05:00:00Z`. */
  seasonId: string;
  /** End of the season (ISO). */
  seasonEnd: string;
  trophies: number;
  worldRank: number;
  /** Position in the clan's country; `null` when unknown. */
  countryRank: number | null;
  /** ISO code of that country (`IT`). */
  countryCode: string | null;
}

/** One side of a war, as told by the announcement. */
export interface WarSide {
  name: string;
  /** Clan badge (the opponent's, from the game's servers); `null` when unknown. */
  badgeUrl: string | null;
  stars: number;
  destruction: number;
  attacks: number;
}

/** The result of a war of a clan of the Crusade. */
export interface WarData extends ClanPart {
  kind: 'war';
  warKey: string;
  endTime: string;
  result: 'win' | 'lose' | 'tie';
  teamSize: number;
  attacksPerMember: number;
  clan: WarSide;
  opponent: WarSide & { tag: string };
  /**
   * Up to three attackers: the most stars, then the most destruction, then the least time spent
   * attacking. Their stars, average destruction, attacks and average time per attack (seconds,
   * `null` when no attack has its time; missing in drafts prepared before it was told).
   */
  bestAttackers: { name: string; stars: number; destruction: number; attacks: number; averageTime?: number | null }[];
}

/** A Raid Weekend of a clan of the Crusade. */
export interface RaidData extends ClanPart {
  kind: 'raid';
  startTime: string;
  endTime: string;
  capitalGold: number;
  attacks: number;
  /** Enemy districts destroyed and raids (whole capitals) completed. */
  districts: number;
  raids: number;
  /**
   * Rewards as the API gives them: raid medals per attack (`offensiveReward`, see {@link raidMedals})
   * and for the defenses (`defensiveReward`, each member).
   */
  offensiveReward: number;
  defensiveReward: number;
  /** Members who attacked (`null`: the member list was never read). */
  participants: number | null;
  /** Up to three members who looted the most Capital Gold. */
  topLooters: { name: string; gold: number; attacks: number }[];
  honours: Honour[];
}

/** A player of a CWL line-up. */
export interface LineupPlayer {
  name: string;
  townHallLevel: number | null;
  /** Clan of the Crusade the player is in now (they may have to move to the clan of the CWL). */
  clanTag: string;
}

/** The Clan War League line-up of a season, as frozen when its selection was closed. */
export interface LineupData extends ClanPart {
  kind: 'lineup';
  season: string;
  starters: LineupPlayer[];
  reserves: LineupPlayer[];
}

export type AnnouncementData =
  | MonthData
  | CwlData
  | DonationsData
  | RecordData
  | PromotionData
  | LegendSeasonData
  | WarData
  | RaidData
  | LineupData;

export function clanName(clanTag: string): string {
  return CRUSADE_CLAN_NAMES[clanTag] ?? clanTag;
}

/** The commendations awarded in some periods, grouped by commendation (catalogue order). */
async function honoursOf(periodKeys: string[], playerTags?: ReadonlySet<string>): Promise<Honour[]> {
  const awards = await CommendationAwardModel.find({ periodKey: { $in: periodKeys } })
    .select('playerTag playerName type tier awardedAt')
    .sort({ awardedAt: 1 })
    .lean();
  const groups = new Map<string, Map<string, { name: string; times: number }>>();
  for (const award of awards) {
    if (playerTags && !playerTags.has(award.playerTag)) continue;
    const id = commendationName({ type: award.type as CommendationType, tier: (award.tier ?? null) as CommendationTier | null });
    const players = groups.get(id) ?? new Map<string, { name: string; times: number }>();
    const player = players.get(award.playerTag) ?? { name: award.playerName, times: 0 };
    player.name = award.playerName;
    player.times += 1;
    players.set(award.playerTag, player);
    groups.set(id, players);
  }
  const honours: Honour[] = [];
  for (const type of COMMENDATION_TYPES) {
    for (const medal of medalsOf(type)) {
      const players = groups.get(commendationName(medal));
      if (!players?.size) continue;
      honours.push({
        ...medal,
        players: [...players.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name, 'it')),
      });
    }
  }
  return honours;
}

const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** The month of a clan: wars, Raid Weekends started in it, commendations of the month, its wars and its Raid Weekends. */
export async function buildMonthData(clanTag: string, month: string): Promise<MonthData> {
  const suffix = periodSuffix(clanTag);
  let period: HistoryPeriod | null = null;
  try {
    period = await getPeriod(month, clanTag);
  } catch {
    // A month without wars (only Raid Weekends): no war figures.
  }
  const { from, to } = monthBounds(month);
  const raids = await RaidSeasonModel.find({ clanTag, state: 'ended', startTime: { $gte: from, $lt: to } })
    .select('startTime season')
    .lean();

  let wars: MonthData['wars'] = null;
  let mvp: MonthData['mvp'] = null;
  if (period?.wars.length) {
    const players = period.players;
    const attacksUsed = players.reduce((sum, p) => sum + p.attacksUsed, 0);
    const threeStars = players.reduce((sum, p) => sum + p.threeStars, 0);
    const total = period.wars.length;
    wars = {
      total,
      victories: period.wars.filter((w) => w.result === 'victory').length,
      draws: period.wars.filter((w) => w.result === 'draw').length,
      defeats: period.wars.filter((w) => w.result === 'defeat').length,
      stars: period.wars.reduce((sum, w) => sum + w.stars, 0),
      averageStars: round(period.wars.reduce((sum, w) => sum + w.stars, 0) / total, 2),
      averageDestruction: round(period.wars.reduce((sum, w) => sum + w.destruction, 0) / total, 1),
      threeStarRate: attacksUsed ? round((threeStars / attacksUsed) * 100, 1) : 0,
      attacksUsed,
      attacksMissed: players.reduce((sum, p) => sum + p.attacksMissed, 0),
    };
    const best = [...players].filter((p) => p.wars >= MIN_WARS).sort(compareForRanking)[0];
    if (best) mvp = { name: best.name, averageStars: best.averageStarsPerWar, wars: best.wars };
  }

  const raidPart = raids.length
    ? {
        weekends: raids.length,
        capitalGold: raids.reduce((sum, r) => sum + Number((r.season as Record<string, unknown>)['capitalTotalLoot'] ?? 0), 0),
        attacks: raids.reduce((sum, r) => sum + Number((r.season as Record<string, unknown>)['totalAttacks'] ?? 0), 0),
      }
    : null;

  const keys = [
    `month:${month}${suffix}`,
    ...(period?.wars ?? []).map((w) => `war:${w.id}${suffix}`),
    ...raids.map((r) => `raid:${r.startTime.toISOString()}${suffix}`),
  ];
  return {
    kind: 'month',
    clanTag,
    clanName: clanName(clanTag),
    month,
    wars,
    raids: raidPart,
    mvp,
    honours: await honoursOf(keys),
  };
}

interface LeagueWarSide {
  tag: string;
  stars: number;
  destructionPercentage: number;
  members?: { tag: string; name: string; attacks?: { stars: number }[] }[];
}

/** A Clan War League season of a clan: place in the group, wins, best attackers, commendations. */
export async function buildCwlData(clanTag: string, season: string): Promise<CwlData> {
  const doc = await CwlSeasonModel.findOne({ clanTag, season }).lean();
  const table = new Map<string, { stars: number; destruction: number }>();
  for (const clan of (doc?.clans ?? []) as { tag: string }[]) table.set(clan.tag, { stars: 0, destruction: 0 });
  let wins = 0;
  let draws = 0;
  let losses = 0;
  const players = new Map<string, { name: string; stars: number; attacks: number }>();
  for (const { war } of doc?.wars ?? []) {
    const { state, clan, opponent } = war as { state: string; clan?: LeagueWarSide; opponent?: LeagueWarSide };
    if (!clan || !opponent || state === 'preparation') continue;
    const diff = clan.stars - opponent.stars || clan.destructionPercentage - opponent.destructionPercentage;
    const ended = state === 'warEnded';
    const winner = ended && diff !== 0 ? (diff > 0 ? clan.tag : opponent.tag) : null;
    for (const side of [clan, opponent]) {
      const row = table.get(side.tag) ?? { stars: 0, destruction: 0 };
      row.stars += side.stars + (winner === side.tag ? 10 : 0);
      row.destruction += side.destructionPercentage;
      table.set(side.tag, row);
    }
    const own = clan.tag === clanTag ? clan : opponent.tag === clanTag ? opponent : null;
    if (!own) continue;
    if (ended) {
      if (winner === null) draws++;
      else if (winner === clanTag) wins++;
      else losses++;
    }
    for (const member of own.members ?? []) {
      const player = players.get(member.tag) ?? { name: member.name, stars: 0, attacks: 0 };
      player.name = member.name;
      player.attacks += member.attacks?.length ?? 0;
      player.stars += (member.attacks ?? []).reduce((sum, a) => sum + a.stars, 0);
      players.set(member.tag, player);
    }
  }
  const standings = [...table].sort(([, a], [, b]) => b.stars - a.stars || b.destruction - a.destruction);
  const index = standings.findIndex(([tag]) => tag === clanTag);
  const mostAttacks = Math.max(0, ...[...players.values()].map((p) => p.attacks));
  const busiest = [...players.values()].filter((p) => p.attacks === mostAttacks);
  const mostStars = Math.max(0, ...busiest.map((p) => p.stars));
  const best = busiest
    .filter((p) => p.stars === mostStars)
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b, 'it'));
  return {
    kind: 'cwl',
    clanTag,
    clanName: clanName(clanTag),
    season,
    rank: index >= 0 ? index + 1 : null,
    clans: standings.length,
    wins,
    draws,
    losses,
    stars: standings[index]?.[1].stars ?? 0,
    bestAttackers: mostAttacks > 0 ? { names: best, stars: mostStars, attacks: mostAttacks } : null,
    honours: await honoursOf([`cwl:${season}${periodSuffix(clanTag)}`]),
  };
}

/**
 * The donations of a game season in a clan: players are counted in the clan of their last donation
 * (totals saved before the clan was tracked count for the main clan). `null` when nobody donated there.
 */
export async function buildDonationsData(clanTag: string, season: string): Promise<DonationsData | null> {
  const clanFilter = clanTag === primaryClanTag() ? { $in: [clanTag, null] } : clanTag;
  const totals = await DonationTotalModel.find({ season, clanTag: clanFilter, donations: { $gt: 0 } })
    .sort({ donations: -1, playerName: 1 })
    .lean();
  if (!totals.length) return null;
  return {
    kind: 'donations',
    clanTag,
    clanName: clanName(clanTag),
    season,
    total: totals.reduce((sum, t) => sum + t.donations, 0),
    top: totals.slice(0, 5).map((t) => ({ name: t.playerName, donations: t.donations })),
    honours: await honoursOf([`donations:${season}`], new Set(totals.map((t) => t.playerTag))),
  };
}

/** Attacks of a member in a Raid Weekend (and bonus ones aside): the API's offensive reward is per attack. */
export const MAXIMUM_CAPITAL_RAIDS = 6;

/** Raid medals a member who used every attack earns, from attacks and defenses (as the Raid Weekend page). */
export function raidMedals(data: Pick<RaidData, 'offensiveReward' | 'defensiveReward'>): { offense: number; defense: number; total: number } {
  const offense = MAXIMUM_CAPITAL_RAIDS * data.offensiveReward;
  return { offense, defense: data.defensiveReward, total: offense + data.defensiveReward };
}

/** Length of a war attack (3 minutes): the time of an attack whose duration is unknown. */
const MAX_ATTACK_SECONDS = 180;

/** Saved war (`Wars`), as far as the announcement reads it. */
interface SavedWar {
  warKey: string;
  clanTag: string;
  endTime: Date;
  result?: 'win' | 'lose' | 'tie' | null;
  teamSize: number;
  attacksPerMember: number;
  clan: SavedWarSide;
  opponent: SavedWarSide;
}

interface SavedWarSide {
  tag: string;
  name: string;
  badgeUrl?: string | null;
  attacks?: number | null;
  stars: number;
  destructionPercentage: number;
  members?: { name: string; attacks?: { stars: number; destructionPercentage: number; duration?: number | null }[] }[];
}

/** The result of an ended war; `null` while its result is not known. */
export function buildWarData(war: SavedWar): WarData | null {
  if (!war.result) return null;
  const side = (s: SavedWarSide): WarSide => ({
    name: s.name,
    badgeUrl: s.badgeUrl ?? null,
    stars: s.stars,
    destruction: round(s.destructionPercentage, 2),
    attacks: s.attacks ?? 0,
  });
  const bestAttackers = (war.clan.members ?? [])
    .map((m) => ({
      name: m.name,
      stars: (m.attacks ?? []).reduce((sum, a) => sum + a.stars, 0),
      destruction: (m.attacks ?? []).reduce((sum, a) => sum + a.destructionPercentage, 0),
      attacks: m.attacks?.length ?? 0,
      // Seconds spent attacking; an attack without its time (saved before it was read) counts as the longest.
      time: (m.attacks ?? []).reduce((sum, a) => sum + (a.duration ?? MAX_ATTACK_SECONDS), 0),
      timed: (m.attacks ?? []).flatMap((a) => (a.duration == null ? [] : [a.duration])),
    }))
    .filter((m) => m.attacks > 0)
    // Many attackers end with every star at 100%: the fastest of them come first.
    .sort((a, b) => b.stars - a.stars || b.destruction - a.destruction || a.time - b.time || a.name.localeCompare(b.name, 'it'))
    .slice(0, 3)
    .map(({ name, stars, destruction, attacks, timed }) => ({
      name,
      stars,
      destruction: round(destruction / attacks, 1),
      attacks,
      // Told in the post: it is what ranks players with the same stars and destruction.
      averageTime: timed.length ? Math.round(timed.reduce((sum, s) => sum + s, 0) / timed.length) : null,
    }));
  return {
    kind: 'war',
    clanTag: war.clanTag,
    clanName: clanName(war.clanTag),
    warKey: war.warKey,
    endTime: war.endTime.toISOString(),
    result: war.result,
    teamSize: war.teamSize,
    attacksPerMember: war.attacksPerMember,
    clan: side(war.clan),
    opponent: { ...side(war.opponent), tag: war.opponent.tag },
    bestAttackers,
  };
}

/** A Raid Weekend as saved (`RaidSeasons`): the API's item in `season`. */
interface SavedRaid {
  clanTag: string;
  startTime: Date;
  endTime: Date;
  hasMembers?: boolean | null;
  season: unknown;
}

/** An ended Raid Weekend: totals, rewards, best looters and its commendations. */
export async function buildRaidData(raid: SavedRaid): Promise<RaidData> {
  const season = (raid.season ?? {}) as Record<string, unknown>;
  const count = (key: string) => Number(season[key] ?? 0) || 0;
  const members = ((season['members'] ?? []) as { name: string; attacks?: number; capitalResourcesLooted?: number }[]).filter(
    (m) => (m.attacks ?? 0) > 0,
  );
  return {
    kind: 'raid',
    clanTag: raid.clanTag,
    clanName: clanName(raid.clanTag),
    startTime: raid.startTime.toISOString(),
    endTime: raid.endTime.toISOString(),
    capitalGold: count('capitalTotalLoot'),
    attacks: count('totalAttacks'),
    districts: count('enemyDistrictsDestroyed'),
    raids: count('raidsCompleted'),
    offensiveReward: count('offensiveReward'),
    defensiveReward: count('defensiveReward'),
    participants: raid.hasMembers ? members.length : null,
    topLooters: [...members]
      .sort((a, b) => (b.capitalResourcesLooted ?? 0) - (a.capitalResourcesLooted ?? 0) || a.name.localeCompare(b.name, 'it'))
      .slice(0, 3)
      .map((m) => ({ name: m.name, gold: m.capitalResourcesLooted ?? 0, attacks: m.attacks ?? 0 })),
    honours: raid.hasMembers ? await honoursOf([`raid:${raid.startTime.toISOString()}${periodSuffix(raid.clanTag)}`]) : [],
  };
}

/** A ranked player of a selection, as far as the line-up reads it (`SelectionRow`). */
interface SelectionRowPart {
  name: string;
  townHallLevel: number | null;
  clanTag: string;
  status: string;
}

/** The line-up of a season from the ranking of its closed selection (starters and reserves, in order). */
export function buildLineupData(clanTag: string, season: string, rows: SelectionRowPart[]): LineupData {
  const pick = (status: string) =>
    rows.filter((r) => r.status === status).map((r) => ({ name: r.name, townHallLevel: r.townHallLevel, clanTag: r.clanTag }));
  return { kind: 'lineup', clanTag, clanName: clanName(clanTag), season, starters: pick('starter'), reserves: pick('reserve') };
}
