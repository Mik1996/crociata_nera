import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { War, WarModel } from './war.model';

/**
 * Monthly war history and player rankings computed from the wars saved in MongoDB.
 * Same JSON format and rules as the frontend
 * (`src/app/core/utils/monthly-history.ts`), so the Statistics page works unchanged:
 * months in the Europe/Rome time zone, ranking by average stars per war.
 */

export type WarOutcome = 'victory' | 'defeat' | 'draw';

export interface HistoryAttack {
  stars: number;
  destruction: number;
  defenderTownHall: number | null;
  defenderPosition: number | null;
}

export interface HistoryWarPlayer {
  tag: string;
  name: string;
  townHall: number;
  mapPosition: number;
  attacksAvailable: number;
  attacks: HistoryAttack[];
  opponentAttacks: number;
  starsConceded: number;
}

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
  averageStarsPerWar: number;
  averageStarsPerAttack: number;
  threeStarRate: number;
  averageDestruction: number;
  participation: number;
  opponentAttacks: number;
  averageStarsConceded: number;
}

export interface HistoryPeriod {
  period: string;
  updatedAt: string | null;
  wars: HistoryWar[];
  players: HistoryPlayerStats[];
}

export interface MonthSummary {
  month: string;
  updatedAt: string;
  wars: number;
  victories: number;
  draws: number;
  defeats: number;
}

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
});

/** Month (YYYY-MM) of a date, in the Italian time zone. */
export function monthOf(date: Date | string): string {
  return MONTH_FORMAT.format(new Date(date)).slice(0, 7);
}

/** First instant of a month (YYYY-MM) in the Italian time zone (midnight of the 1st, CET or CEST). */
function monthStart(year: number, month: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, 1);
  const label = `${year}-${String(month).padStart(2, '0')}`;
  // Rome is UTC+1 or UTC+2; midnight is never inside a daylight saving change.
  for (const offsetHours of [1, 2]) {
    const start = new Date(utcMidnight - offsetHours * 3_600_000);
    if (monthOf(start) === label && monthOf(new Date(start.getTime() - 1)) !== label) return start;
  }
  throw new Error(`No start found for month ${label}`);
}

/** `[from, to)` instants of a month (YYYY-MM) in the Italian time zone. */
export function monthBounds(month: string): { from: Date; to: Date } {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    from: monthStart(year, m),
    to: m === 12 ? monthStart(year + 1, 1) : monthStart(year, m + 1),
  };
}

const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const percentage = (part: number, total: number) => (total > 0 ? round((part / total) * 100) : 0);

/** Fields of a saved war read by {@link toHistoryWar}. */
type HistorySource = Pick<
  War,
  'warKey' | 'state' | 'endTime' | 'teamSize' | 'attacksPerMember' | 'clan' | 'opponent'
>;

/** History entry of an ended war saved by the war sync (with members). */
export function toHistoryWar(war: HistorySource): HistoryWar | null {
  if (war.state !== 'warEnded' || !war.clan.members.length) return null;
  const defenders = new Map(war.opponent.members.map((m) => [m.tag, m]));
  const diff =
    war.clan.stars - war.opponent.stars ||
    war.clan.destructionPercentage - war.opponent.destructionPercentage;
  return {
    id: war.warKey,
    endTime: war.endTime.toISOString(),
    opponent: war.opponent.name,
    opponentTag: war.opponent.tag,
    teamSize: war.teamSize,
    attacksPerMember: war.attacksPerMember,
    result: diff > 0 ? 'victory' : diff < 0 ? 'defeat' : 'draw',
    stars: war.clan.stars,
    starsConceded: war.opponent.stars,
    destruction: round(war.clan.destructionPercentage, 2),
    destructionConceded: round(war.opponent.destructionPercentage, 2),
    players: [...war.clan.members]
      .sort((a, b) => a.mapPosition - b.mapPosition)
      .map((m) => ({
        tag: m.tag,
        name: m.name,
        townHall: m.townhallLevel,
        mapPosition: m.mapPosition,
        attacksAvailable: war.attacksPerMember,
        attacks: m.attacks.map((a) => {
          const defender = defenders.get(a.defenderTag);
          return {
            stars: a.stars,
            destruction: a.destructionPercentage,
            defenderTownHall: defender?.townhallLevel ?? null,
            defenderPosition: defender?.mapPosition ?? null,
          };
        }),
        opponentAttacks: m.opponentAttacks ?? 0,
        starsConceded: m.bestOpponentAttack?.stars ?? 0,
      })),
  };
}

export function compareForRanking(a: HistoryPlayerStats, b: HistoryPlayerStats): number {
  return (
    b.averageStarsPerWar - a.averageStarsPerWar ||
    b.averageDestruction - a.averageDestruction ||
    b.participation - a.participation ||
    b.wars - a.wars
  );
}

/** Sums wars per player and computes the averages, sorted for the ranking. */
export function aggregatePlayers(wars: HistoryWar[]): HistoryPlayerStats[] {
  const byTag = new Map<
    string,
    Omit<
      HistoryPlayerStats,
      | 'attacksMissed'
      | 'averageStarsPerWar'
      | 'averageStarsPerAttack'
      | 'threeStarRate'
      | 'averageDestruction'
      | 'participation'
      | 'averageStarsConceded'
    > & {
      totalDestruction: number;
      starsConceded: number;
    }
  >();

  for (const war of [...wars].sort((a, b) => a.endTime.localeCompare(b.endTime))) {
    for (const p of war.players) {
      const t = byTag.get(p.tag) ?? {
        tag: p.tag,
        name: p.name,
        townHall: p.townHall,
        lastWar: war.endTime,
        wars: 0,
        attacksAvailable: 0,
        attacksUsed: 0,
        stars: 0,
        threeStars: 0,
        twoStars: 0,
        oneStar: 0,
        zeroStars: 0,
        totalDestruction: 0,
        opponentAttacks: 0,
        starsConceded: 0,
      };
      t.name = p.name;
      t.townHall = p.townHall;
      t.lastWar = war.endTime;
      t.wars += 1;
      t.attacksAvailable += p.attacksAvailable;
      t.attacksUsed += p.attacks.length;
      for (const a of p.attacks) {
        t.stars += a.stars;
        t.totalDestruction += a.destruction;
        if (a.stars === 3) t.threeStars += 1;
        else if (a.stars === 2) t.twoStars += 1;
        else if (a.stars === 1) t.oneStar += 1;
        else t.zeroStars += 1;
      }
      t.opponentAttacks += p.opponentAttacks;
      t.starsConceded += p.starsConceded;
      byTag.set(p.tag, t);
    }
  }

  return [...byTag.values()]
    .map(({ totalDestruction, starsConceded, ...t }) => ({
      ...t,
      attacksMissed: t.attacksAvailable - t.attacksUsed,
      averageStarsPerWar: t.wars ? round(t.stars / t.wars, 2) : 0,
      averageStarsPerAttack: t.attacksUsed ? round(t.stars / t.attacksUsed, 2) : 0,
      threeStarRate: percentage(t.threeStars, t.attacksUsed),
      averageDestruction: t.attacksUsed ? round(totalDestruction / t.attacksUsed, 1) : 0,
      participation: percentage(t.attacksUsed, t.attacksAvailable),
      averageStarsConceded: t.wars ? round(starsConceded / t.wars, 2) : 0,
    }))
    .sort(compareForRanking);
}

/** Filter of the ended wars of a clan: the main one (`CLAN_TAG`) unless another clan of the Crusade is given. */
function endedFilter(clanTag: string | undefined) {
  return { state: 'warEnded', ...(clanTag ? { clanTag } : {}) };
}

/** Fields read by {@link toHistoryWar} (no war log details, no sync bookkeeping). */
const HISTORY_PROJECTION = {
  _id: 0,
  warKey: 1,
  state: 1,
  endTime: 1,
  teamSize: 1,
  attacksPerMember: 1,
  'clan.stars': 1,
  'clan.destructionPercentage': 1,
  'clan.members.tag': 1,
  'clan.members.name': 1,
  'clan.members.townhallLevel': 1,
  'clan.members.mapPosition': 1,
  'clan.members.attacks.defenderTag': 1,
  'clan.members.attacks.stars': 1,
  'clan.members.attacks.destructionPercentage': 1,
  'clan.members.opponentAttacks': 1,
  'clan.members.bestOpponentAttack.stars': 1,
  'opponent.name': 1,
  'opponent.tag': 1,
  'opponent.stars': 1,
  'opponent.destructionPercentage': 1,
  'opponent.members.tag': 1,
  'opponent.members.townhallLevel': 1,
  'opponent.members.mapPosition': 1,
} as const;

/** Last change to any ended war of the clan (`updatedAt` of every period and month). */
async function lastUpdate(clanTag: string | undefined): Promise<string | null> {
  const last = await WarModel.findOne(endedFilter(clanTag), { _id: 0, updatedAt: 1 })
    .sort({ updatedAt: -1 })
    .lean<{ updatedAt?: Date }>();
  return last?.updatedAt?.toISOString() ?? null;
}

/** Ended wars of a clan, most recent first; only those of `month` (YYYY-MM, Italian time zone) when given. */
async function endedWars(clanTag: string | undefined, month?: string): Promise<HistoryWar[]> {
  const bounds = month ? monthBounds(month) : null;
  const filter = bounds
    ? { ...endedFilter(clanTag), endTime: { $gte: bounds.from, $lt: bounds.to } }
    : endedFilter(clanTag);
  const docs = await WarModel.find(filter, HISTORY_PROJECTION)
    .sort({ endTime: -1 })
    .lean<HistorySource[]>();
  return docs.map(toHistoryWar).filter((w): w is HistoryWar => w !== null);
}

interface MonthCount {
  _id: string;
  wars: number;
  victories: number;
  draws: number;
  defeats: number;
}

/** `GET /history`: months with recorded wars, most recent first. */
export async function listMonths(
  clanTag: string | undefined = env().CLAN_TAG,
): Promise<MonthSummary[]> {
  // Same result as `toHistoryWar`: stars first, then destruction; wars without members are left out.
  const diff = {
    $let: {
      vars: { stars: { $subtract: ['$clan.stars', '$opponent.stars'] } },
      in: {
        $cond: [
          { $ne: ['$$stars', 0] },
          '$$stars',
          { $subtract: ['$clan.destructionPercentage', '$opponent.destructionPercentage'] },
        ],
      },
    },
  };
  const [counts, updatedAt] = await Promise.all([
    WarModel.aggregate<MonthCount>([
      { $match: { ...endedFilter(clanTag), 'clan.members.0': { $exists: true } } },
      {
        $project: {
          month: { $dateToString: { date: '$endTime', format: '%Y-%m', timezone: 'Europe/Rome' } },
          diff,
        },
      },
      {
        $group: {
          _id: '$month',
          wars: { $sum: 1 },
          victories: { $sum: { $cond: [{ $gt: ['$diff', 0] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ['$diff', 0] }, 1, 0] } },
          defeats: { $sum: { $cond: [{ $lt: ['$diff', 0] }, 1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
    ]),
    lastUpdate(clanTag),
  ]);
  return counts.map(({ _id, wars, victories, draws, defeats }) => ({
    month: _id,
    updatedAt: updatedAt ?? new Date().toISOString(),
    wars,
    victories,
    draws,
    defeats,
  }));
}

/** `GET /history/{YYYY-MM|all}`: wars and ranking of a period; 404 for a month without wars. */
export async function getPeriod(
  period: string,
  clanTag: string | undefined = env().CLAN_TAG,
): Promise<HistoryPeriod> {
  if (period !== 'all' && !MONTH_REGEX.test(period))
    throwException(400, MessageKey.PERIOD_IS_NOT_VALID);
  const [wars, updatedAt] = await Promise.all([
    endedWars(clanTag, period === 'all' ? undefined : period),
    lastUpdate(clanTag),
  ]);
  if (period !== 'all' && !wars.length) throwException(404, MessageKey.HISTORY_NOT_FOUND);
  return { period, updatedAt, wars, players: aggregatePlayers(wars) };
}
