import { CRUSADE_CLAN_NAMES, periodSuffix, primaryClanTag } from '@/lib/coc/crusade-clans';
import { CommendationAwardModel } from '@/modules/commendations/commendation-award.model';
import {
  COMMENDATION_TIERS,
  COMMENDATION_TYPES,
  CommendationTier,
  CommendationType,
  MIN_WARS,
} from '@/modules/commendations/commendation-rules';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { DonationTotalModel } from '@/modules/donations/donation.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { compareForRanking, getPeriod, HistoryPeriod, monthBounds } from '@/modules/wars/history.service';

/** Players awarded one commendation in the period (`times` > 1: earned in more Raid Weekends). */
export interface Honour {
  type: CommendationType;
  tier: CommendationTier;
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

export type AnnouncementData = MonthData | CwlData | DonationsData | RecordData | PromotionData | LegendSeasonData;

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
    const id = `${award.type}-${award.tier}`;
    const players = groups.get(id) ?? new Map<string, { name: string; times: number }>();
    const player = players.get(award.playerTag) ?? { name: award.playerName, times: 0 };
    player.name = award.playerName;
    player.times += 1;
    players.set(award.playerTag, player);
    groups.set(id, players);
  }
  const honours: Honour[] = [];
  for (const type of COMMENDATION_TYPES) {
    for (const tier of COMMENDATION_TIERS) {
      const players = groups.get(`${type}-${tier}`);
      if (!players?.size) continue;
      honours.push({
        type,
        tier,
        players: [...players.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name, 'it')),
      });
    }
  }
  return honours;
}

const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** The month of a clan: wars, Raid Weekends started in it, commendations of both. */
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

  const keys = [`month:${month}${suffix}`, ...raids.map((r) => `raid:${r.startTime.toISOString()}${suffix}`)];
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
