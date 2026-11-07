import { mapWar, parseCocDate } from '../api/coc-api.mappers';
import { CocCapitalRaidSeason, CocCwlSeasonRecord, CocWar } from '../api/coc-api.types';
import { CwlPlayerStats, CwlRound, CwlSeason, CwlStanding, CwlState, RaidSeason } from '../models';
import { round } from './war-stats';

/** Placeholder of the API for wars not scheduled yet. */
const UNSCHEDULED = '#0';
/** Bonus stars for every war won, in the standings. */
const WIN_BONUS = 10;

/** `2026-11` or `2026-11-01` -> `2026-11`. */
export function cwlMonth(season: string): string {
  return season.slice(0, 7);
}

function cwlState(state: string): CwlState {
  return state === 'ended' ? 'ended' : state === 'preparation' ? 'preparation' : 'inWar';
}

/** Puts the clan on the `clan` side (in a CWL war it can be either side). */
function orient(war: CocWar, clanTag: string): CocWar {
  return war.opponent?.tag === clanTag ? { ...war, clan: war.opponent, opponent: war.clan } : war;
}

/** Winner by stars, then destruction; `null` for a draw or a war not ended. */
function winnerTag(war: CocWar): string | null {
  if (war.state !== 'warEnded' || !war.clan || !war.opponent) return null;
  const diff = war.clan.stars - war.opponent.stars || war.clan.destructionPercentage - war.opponent.destructionPercentage;
  return diff > 0 ? war.clan.tag : diff < 0 ? war.opponent.tag : null;
}

/**
 * Builds a season from the group and the wars saved by the backend (formats of the official API):
 * standings of the 8 clans, the clan's 7 rounds and the statistics of its players.
 */
export function buildCwlSeason(raw: CocCwlSeasonRecord, clanTag: string): CwlSeason {
  const wars = new Map(raw.wars.map((w) => [w.warTag, w]));

  // Standings: every war of the group counts.
  const table = new Map<string, Omit<CwlStanding, 'rank'>>(
    raw.clans.map((c) => [
      c.tag,
      { tag: c.tag, name: c.name, badgeUrl: c.badgeUrls?.medium, clanLevel: c.clanLevel, stars: 0, destruction: 0, wins: 0, isOwn: c.tag === clanTag },
    ]),
  );
  for (const war of raw.wars) {
    const winner = winnerTag(war);
    for (const side of [war.clan, war.opponent]) {
      const row = side && table.get(side.tag);
      if (!row || !side) continue;
      row.stars += side.stars + (winner === side.tag ? WIN_BONUS : 0);
      row.destruction += side.destructionPercentage;
      if (winner === side.tag) row.wins += 1;
    }
  }
  const standings = [...table.values()]
    .sort((a, b) => b.stars - a.stars || b.destruction - a.destruction)
    .map((row, i) => ({ ...row, destruction: round(row.destruction, 2), rank: i + 1 }));

  // The clan's war in each round.
  const rounds: CwlRound[] = raw.rounds.map((r, i) => {
    const own = r.warTags
      .filter((tag) => tag !== UNSCHEDULED)
      .map((tag) => wars.get(tag))
      .find((w) => w?.clan?.tag === clanTag || w?.opponent?.tag === clanTag);
    const war = own ? mapWar({ ...orient(own, clanTag), attacksPerMember: 1 }) : null;
    return { round: i + 1, war, state: war?.state ?? 'scheduled' };
  });

  // Player statistics, over the clan's wars.
  const players = new Map<string, CwlPlayerStats & { destructionTotal: number }>();
  for (const { war } of rounds) {
    // In preparation nobody can attack yet: the war does not count as an available attack.
    if (!war || war.state === 'preparation') continue;
    for (const m of war.clan.members) {
      const p = players.get(m.tag) ?? {
        tag: m.tag, name: m.name, townHall: m.townHall, wars: 0, attacks: 0, stars: 0, threeStars: 0,
        averageStars: 0, averageDestruction: 0, destructionTotal: 0,
      };
      p.name = m.name;
      p.townHall = m.townHall;
      p.wars += 1;
      for (const a of m.attacks) {
        p.attacks += 1;
        p.stars += a.stars;
        p.destructionTotal += a.destructionPercentage;
        if (a.stars === 3) p.threeStars += 1;
      }
      players.set(m.tag, p);
    }
  }

  return {
    season: cwlMonth(raw.season),
    state: cwlState(raw.state),
    standings,
    rounds,
    players: [...players.values()]
      .map(({ destructionTotal, ...p }) => ({
        ...p,
        averageStars: p.attacks ? round(p.stars / p.attacks, 2) : 0,
        averageDestruction: p.attacks ? round(destructionTotal / p.attacks, 1) : 0,
      }))
      .sort((a, b) => b.stars - a.stars || b.averageStars - a.averageStars),
  };
}

/** Maps a Raid Weekend of the official API; members by Capital Gold looted. */
export function mapRaidSeason(raw: CocCapitalRaidSeason): RaidSeason {
  return {
    id: parseCocDate(raw.startTime),
    state: raw.state === 'ongoing' ? 'ongoing' : 'ended',
    startTime: parseCocDate(raw.startTime),
    endTime: parseCocDate(raw.endTime),
    totalLoot: raw.capitalTotalLoot,
    raidsCompleted: raw.raidsCompleted,
    totalAttacks: raw.totalAttacks,
    districtsDestroyed: raw.enemyDistrictsDestroyed,
    offensiveReward: raw.offensiveReward,
    defensiveReward: raw.defensiveReward,
    hasMembers: Array.isArray(raw.members),
    members: (raw.members ?? [])
      .map((m) => ({
        tag: m.tag,
        name: m.name,
        attacks: m.attacks,
        attackLimit: m.attackLimit + m.bonusAttackLimit,
        looted: m.capitalResourcesLooted,
      }))
      .sort((a, b) => b.looted - a.looted),
  };
}
