import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { WarDocument, WarModel } from './war.model';

/**
 * Monthly war history and player rankings computed from the wars saved in MongoDB.
 * Same JSON format and rules as the proxy (`server/history.mjs`) and the frontend
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

const MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' });

/** Month (YYYY-MM) of a date, in the Italian time zone. */
export function monthOf(date: Date | string): string {
  return MONTH_FORMAT.format(new Date(date)).slice(0, 7);
}

const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const percentage = (part: number, total: number) => (total > 0 ? round((part / total) * 100) : 0);

/** History entry of an ended war saved by the war sync (with members). */
export function toHistoryWar(war: WarDocument): HistoryWar | null {
  if (war.state !== 'warEnded' || !war.clan.members.length) return null;
  const defenders = new Map(war.opponent.members.map((m) => [m.tag, m]));
  const diff = war.clan.stars - war.opponent.stars || war.clan.destructionPercentage - war.opponent.destructionPercentage;
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

function compareForRanking(a: HistoryPlayerStats, b: HistoryPlayerStats): number {
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
    Omit<HistoryPlayerStats, 'attacksMissed' | 'averageStarsPerWar' | 'averageStarsPerAttack' | 'threeStarRate' | 'averageDestruction' | 'participation' | 'averageStarsConceded'> & {
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

async function endedWars(): Promise<{ wars: HistoryWar[]; updatedAt: string | null }> {
  const clanTag = env().CLAN_TAG;
  const docs = await WarModel.find({ state: 'warEnded', ...(clanTag ? { clanTag } : {}) }).sort({ endTime: -1 });
  const wars = docs.map(toHistoryWar).filter((w): w is HistoryWar => w !== null);
  const updatedAt = docs.reduce<Date | null>((max, d) => (!max || d.updatedAt > max ? d.updatedAt : max), null);
  return { wars, updatedAt: updatedAt?.toISOString() ?? null };
}

/** `GET /history`: months with recorded wars, most recent first. */
export async function listMonths(): Promise<MonthSummary[]> {
  const { wars, updatedAt } = await endedWars();
  const months = new Map<string, HistoryWar[]>();
  for (const war of wars) months.set(monthOf(war.endTime), [...(months.get(monthOf(war.endTime)) ?? []), war]);
  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({
      month,
      updatedAt: updatedAt ?? new Date().toISOString(),
      wars: list.length,
      victories: list.filter((w) => w.result === 'victory').length,
      draws: list.filter((w) => w.result === 'draw').length,
      defeats: list.filter((w) => w.result === 'defeat').length,
    }));
}

/** `GET /history/{YYYY-MM|all}`: wars and ranking of a period; 404 for a month without wars. */
export async function getPeriod(period: string): Promise<HistoryPeriod> {
  if (period !== 'all' && !MONTH_REGEX.test(period)) throwException(400, MessageKey.PERIOD_IS_NOT_VALID);
  const { wars, updatedAt } = await endedWars();
  const selected = period === 'all' ? wars : wars.filter((w) => monthOf(w.endTime) === period);
  if (period !== 'all' && !selected.length) throwException(404, MessageKey.HISTORY_NOT_FOUND);
  return { period, updatedAt, wars: selected, players: aggregatePlayers(selected) };
}
