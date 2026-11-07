import {
  ClanMember,
  PlayerStats,
  War,
  WarKpi,
  WarParticipant,
  WarPerformance,
  WarResult,
} from '../models';

/** Target hit by an attack, enriched with the defender's data. */
export interface AttackTarget {
  mapPosition: number;
  name: string;
  townHall: number;
  stars: number;
  destruction: number;
}

/** Row of a war's participants table. */
export interface ParticipantRow {
  tag: string;
  name: string;
  mapPosition: number;
  townHall: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  averageDestruction: number;
  targets: AttackTarget[];
  hasAttacked: boolean;
}

/** Point of the clan trend over time. */
export interface ClanTrendPoint {
  warId: string;
  date: string;
  opponent: string;
  stars: number;
  starsConceded: number;
  destruction: number;
  /** Attacks used / attacks available (%). */
  participation: number;
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function percentage(part: number, total: number): number {
  return total > 0 ? round((part / total) * 100) : 0;
}

export function average(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** War result from the clan's point of view. */
export function warResult(war: War): WarResult {
  if (war.state !== 'ended') {
    return 'ongoing';
  }
  const { clan, opponent } = war;
  const diff =
    clan.stars - opponent.stars || clan.destructionPercentage - opponent.destructionPercentage;
  if (diff > 0) return 'victory';
  if (diff < 0) return 'defeat';
  return 'draw';
}

/** Clan KPIs for a war. */
export function computeWarKpi(war: War): WarKpi {
  const participants = war.clan.members;
  const attacks = participants.flatMap((p) => p.attacks);
  const withoutAttacks = participants.filter((p) => p.attacks.length === 0).length;
  return {
    attacksAvailable: participants.length * war.attacksPerMember,
    attacksUsed: attacks.length,
    averageStars: round(average(attacks.map((a) => a.stars)), 2),
    threeStarRate: percentage(attacks.filter((a) => a.stars === 3).length, attacks.length),
    participation: percentage(participants.length - withoutAttacks, participants.length),
    participantsWithoutAttacks: withoutAttacks,
  };
}

/** Rows of the participants table (clan side) with resolved targets. */
export function participantRows(war: War): ParticipantRow[] {
  const defenders = new Map(war.opponent.members.map((p) => [p.tag, p]));
  return war.clan.members.map((p) => rowFromParticipant(p, war.attacksPerMember, defenders));
}

function rowFromParticipant(
  p: WarParticipant,
  attacksPerMember: number,
  defenders: Map<string, WarParticipant>,
): ParticipantRow {
  return {
    tag: p.tag,
    name: p.name,
    mapPosition: p.mapPosition,
    townHall: p.townHall,
    attacksUsed: p.attacks.length,
    attacksAvailable: attacksPerMember,
    stars: p.attacks.reduce((s, a) => s + a.stars, 0),
    averageDestruction: round(average(p.attacks.map((a) => a.destructionPercentage))),
    hasAttacked: p.attacks.length > 0,
    targets: p.attacks.map((a) => {
      const d = defenders.get(a.defenderTag);
      return {
        mapPosition: d?.mapPosition ?? 0,
        name: d?.name ?? a.defenderTag,
        townHall: d?.townHall ?? 0,
        stars: a.stars,
        destruction: a.destructionPercentage,
      };
    }),
  };
}

/**
 * Stats of a member over the given wars (expected ended, most recent first).
 */
export function computePlayerStats(member: ClanMember, wars: War[]): PlayerStats {
  const history: WarPerformance[] = [];
  for (const war of wars) {
    const p = war.clan.members.find((x) => x.tag === member.tag);
    if (!p) continue;
    history.push({
      warId: war.id,
      date: war.endTime,
      opponent: war.opponent.name,
      result: warResult(war),
      townHall: p.townHall,
      mapPosition: p.mapPosition,
      attacksUsed: p.attacks.length,
      attacksAvailable: war.attacksPerMember,
      stars: p.attacks.reduce((s, a) => s + a.stars, 0),
      averageDestruction: round(average(p.attacks.map((a) => a.destructionPercentage))),
    });
  }
  history.reverse();

  const attacks = wars
    .flatMap((w) => w.clan.members.filter((x) => x.tag === member.tag))
    .flatMap((p) => p.attacks);
  const attacksAvailable = history.reduce((s, a) => s + a.attacksAvailable, 0);
  const totalStars = attacks.reduce((s, a) => s + a.stars, 0);

  return {
    tag: member.tag,
    name: member.name,
    role: member.role,
    townHall: member.townHall,
    league: member.league,
    trophies: member.trophies,
    warsPlayed: history.length,
    warsTotal: wars.length,
    attendance: percentage(history.length, wars.length),
    attacksAvailable,
    attacksUsed: attacks.length,
    totalStars,
    averageStars: round(average(attacks.map((a) => a.stars)), 2),
    threeStarRate: percentage(attacks.filter((a) => a.stars === 3).length, attacks.length),
    averageDestruction: round(average(attacks.map((a) => a.destructionPercentage))),
    history,
  };
}

/**
 * Efficiency index: stars earned per AVAILABLE attack.
 * Penalises unused attacks, unlike the average stars per attack.
 */
export function efficiency(s: PlayerStats): number {
  return s.attacksAvailable > 0 ? round(s.totalStars / s.attacksAvailable, 2) : 0;
}

/** Sorts players by efficiency (descending), excluding those who played fewer than `minWars`. */
export function rankPerformers(stats: PlayerStats[], minWars = 3): PlayerStats[] {
  return stats
    .filter((s) => s.warsPlayed >= minWars)
    .sort((a, b) => efficiency(b) - efficiency(a) || b.averageDestruction - a.averageDestruction);
}

/**
 * Clan trend in chronological order (oldest war first).
 * Uses only the clan totals, so it also works for wars without details.
 */
export function clanTrend(wars: War[]): ClanTrendPoint[] {
  return [...wars]
    .sort((a, b) => a.endTime.localeCompare(b.endTime))
    .map((w) => ({
      warId: w.id,
      date: w.endTime,
      opponent: w.opponent.name,
      stars: w.clan.stars,
      starsConceded: w.opponent.stars,
      destruction: round(w.clan.destructionPercentage),
      participation: percentage(w.clan.attacksUsed, w.teamSize * w.attacksPerMember),
    }));
}
