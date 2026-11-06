import {
  HistoryPeriod,
  HistoryPlayerStats,
  HistoryWar,
  MonthSummary,
  War,
} from '../models';
import { percentage, round, warResult } from './war-stats';

/**
 * Builds the monthly history from the app models.
 * Same logic as the proxy (`server/history.mjs`): used by the mock mode and by tests.
 */

const MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
});

/** Month (YYYY-MM) of an ISO date, in the Italian time zone. */
export function monthOf(iso: string): string {
  return MONTH_FORMAT.format(new Date(iso)).slice(0, 7);
}

/**
 * Human-readable label of a period in the given locale: "Novembre 2026" or, for all months,
 * the (already translated) `allMonthsLabel` text.
 */
export function periodLabel(period: string, locale = 'it-IT', allMonthsLabel = 'Tutti i mesi'): string {
  if (period === 'all') return allMonthsLabel;
  const [year, month] = period.split('-').map(Number);
  const text = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Converts an ended war with details into a history entry. */
export function toHistoryWar(w: War): HistoryWar | null {
  if (w.state !== 'ended' || !w.hasDetails) return null;
  const defenders = new Map(w.opponent.members.map((p) => [p.tag, p]));
  return {
    id: w.id,
    endTime: w.endTime,
    opponent: w.opponent.name,
    opponentTag: w.opponent.tag,
    teamSize: w.teamSize,
    attacksPerMember: w.attacksPerMember,
    result: warResult(w) as HistoryWar['result'],
    stars: w.clan.stars,
    starsConceded: w.opponent.stars,
    destruction: round(w.clan.destructionPercentage, 2),
    destructionConceded: round(w.opponent.destructionPercentage, 2),
    players: w.clan.members.map((p) => ({
      tag: p.tag,
      name: p.name,
      townHall: p.townHall,
      mapPosition: p.mapPosition,
      attacksAvailable: w.attacksPerMember,
      attacks: p.attacks.map((a) => {
        const d = defenders.get(a.defenderTag);
        return {
          stars: a.stars,
          destruction: a.destructionPercentage,
          defenderTownHall: d?.townHall ?? null,
          defenderPosition: d?.mapPosition ?? null,
        };
      }),
      opponentAttacks: p.opponentAttacks,
      starsConceded: p.bestOpponentAttack?.stars ?? 0,
    })),
  };
}

/**
 * Ranking order: average stars per war (max 6 with 2 attacks),
 * then average destruction, participation and number of wars.
 */
export function compareForRanking(a: HistoryPlayerStats, b: HistoryPlayerStats): number {
  return (
    b.averageStarsPerWar - a.averageStarsPerWar ||
    b.averageDestruction - a.averageDestruction ||
    b.participation - a.participation ||
    b.wars - a.wars
  );
}

/** Sums wars per player and computes the averages, already sorted for the ranking. */
export function aggregateHistoryPlayers(wars: HistoryWar[]): HistoryPlayerStats[] {
  interface Accumulator {
    tag: string;
    name: string;
    townHall: number;
    lastWar: string;
    wars: number;
    attacksAvailable: number;
    attacksUsed: number;
    stars: number;
    threeStars: number;
    twoStars: number;
    oneStar: number;
    zeroStars: number;
    totalDestruction: number;
    opponentAttacks: number;
    starsConceded: number;
  }
  const byTag = new Map<string, Accumulator>();

  for (const war of [...wars].sort((a, b) => a.endTime.localeCompare(b.endTime))) {
    for (const p of war.players) {
      const t: Accumulator = byTag.get(p.tag) ?? {
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

/** Groups wars by month. */
function byMonth(wars: HistoryWar[]): Map<string, HistoryWar[]> {
  const months = new Map<string, HistoryWar[]>();
  for (const w of wars) {
    const month = monthOf(w.endTime);
    months.set(month, [...(months.get(month) ?? []), w]);
  }
  return months;
}

/** List of months with their war record, most recent first. */
export function monthSummaries(wars: HistoryWar[], updatedAt: string): MonthSummary[] {
  return [...byMonth(wars).entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({
      month,
      updatedAt,
      wars: list.length,
      victories: list.filter((w) => w.result === 'victory').length,
      draws: list.filter((w) => w.result === 'draw').length,
      defeats: list.filter((w) => w.result === 'defeat').length,
    }));
}

/** Data of a period (`YYYY-MM` or `all`); `null` if the month has no wars. */
export function historyPeriod(
  period: string,
  wars: HistoryWar[],
  updatedAt: string,
): HistoryPeriod | null {
  const selected = period === 'all' ? wars : wars.filter((w) => monthOf(w.endTime) === period);
  if (period !== 'all' && selected.length === 0) return null;
  const sorted = [...selected].sort((a, b) => b.endTime.localeCompare(a.endTime));
  return { period, updatedAt, wars: sorted, players: aggregateHistoryPlayers(sorted) };
}
