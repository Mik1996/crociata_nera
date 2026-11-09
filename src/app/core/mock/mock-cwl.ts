import { CocCapitalRaidSeason, CocCwlSeasonRecord, CocWar, CocWarAttack, CocWarClan, CocWarMember } from '../api/coc-api.types';
import { ClanMember, DonationSeason } from '../models';
import { Random } from './random';

/**
 * Mock Clan War League seasons, Raid Weekends and donation seasons, in the formats of the backend and of the
 * official API: the same conversion code runs in demo mode and with real data.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TEAM_SIZE = 15;
const ROUNDS = 7;

const GROUP_CLANS = [
  'Legione Oscura', 'Dragon Slayers', 'Fenice Rossa', 'Brotherhood ITA', 'Spartans 300', 'Lupi Solitari',
  'Iron Wolves', 'Kaiser Krieger', 'Valhalla Rising', 'Samurai Spirit', 'Northern Lights', 'Desert Storm',
];
const TAG_CHARS = '0289PYLQGRJCUV';

/** Players with a fixed level of play, so the commendations have something to show. */
const CWL_SKILL: Record<string, number> = { 'Templare Nero': 1, Excalibur: 0.93, Ragnar: 0.85 };
const RAID_LOOT: Record<string, [min: number, max: number]> = {
  'Templare Nero': [30_500, 33_000],
  Excalibur: [27_600, 29_800],
  Ragnar: [25_100, 27_400],
};

/** API date format: `20261101T080000.000Z`. */
function cocDate(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '');
}

function tag(rnd: Random): string {
  let value = '#';
  for (let i = 0; i < 9; i++) value += rnd.pick([...TAG_CHARS]);
  return value;
}

/** Stable skill (0.35-0.9) for a player without a fixed level. */
function skillOf(member: { name: string }, rnd: Random): number {
  return CWL_SKILL[member.name] ?? rnd.range(0.35, 0.9);
}

/** One attack per member against the opposing player at about the same position. */
function attack(rnd: Random, attacker: CocWarMember, defenders: CocWarMember[], skill: number, order: number): CocWarAttack {
  const target = defenders[Math.min(defenders.length - 1, Math.max(0, attacker.mapPosition - 1 + rnd.int(-1, 1)))];
  const roll = skill >= 1 ? 1 : rnd.next() * 0.7 + skill * 0.45 + (attacker.townhallLevel - target.townhallLevel) * 0.1;
  const stars = roll > 0.85 ? 3 : roll > 0.5 ? 2 : roll > 0.25 ? 1 : 0;
  return {
    attackerTag: attacker.tag,
    defenderTag: target.tag,
    stars,
    destructionPercentage: stars === 3 ? 100 : stars === 2 ? rnd.int(55, 99) : stars === 1 ? rnd.int(35, 70) : rnd.int(10, 49),
    order,
    duration: rnd.int(90, 180),
  };
}

/** Stars and destruction of a side: best result against each defender. */
function totals(attacks: CocWarAttack[], teamSize: number): { stars: number; destructionPercentage: number } {
  const best = new Map<string, { stars: number; destruction: number }>();
  for (const a of attacks) {
    const current = best.get(a.defenderTag) ?? { stars: 0, destruction: 0 };
    best.set(a.defenderTag, {
      stars: Math.max(current.stars, a.stars),
      destruction: Math.max(current.destruction, a.destructionPercentage),
    });
  }
  const values = [...best.values()];
  return {
    stars: values.reduce((s, v) => s + v.stars, 0),
    destructionPercentage: Math.round((values.reduce((s, v) => s + v.destruction, 0) / teamSize) * 100) / 100,
  };
}

interface GroupClan {
  tag: string;
  name: string;
  level: number;
  /** Players of the clan (for the line-ups). */
  roster: { tag: string; name: string; townHall: number }[];
}

/** A war between two clans of the group; `progress` < 1 for a battle in progress, 0 in preparation. */
function leagueWar(rnd: Random, a: GroupClan, b: GroupClan, times: { prep: number; start: number; end: number }, progress: number): CocWar {
  const lineUp = (clan: GroupClan): CocWarMember[] =>
    [...clan.roster]
      .sort((x, y) => (x.name === 'Templare Nero' ? -1 : y.name === 'Templare Nero' ? 1 : y.townHall - x.townHall))
      .slice(0, TEAM_SIZE)
      .sort((x, y) => y.townHall - x.townHall)
      .map((p, i) => ({ tag: p.tag, name: p.name, townhallLevel: p.townHall, mapPosition: i + 1, attacks: [], opponentAttacks: 0 }));
  const sideA = lineUp(a);
  const sideB = lineUp(b);
  let order = 1;
  for (const [attackers, defenders] of [
    [sideA, sideB],
    [sideB, sideA],
  ] as const) {
    for (const m of attackers) {
      if (!rnd.chance(progress)) continue;
      const hit = attack(rnd, m, defenders, skillOf(m, rnd), order++);
      m.attacks = [hit];
      const defender = defenders.find((d) => d.tag === hit.defenderTag)!;
      defender.opponentAttacks += 1;
      if (!defender.bestOpponentAttack || hit.stars > defender.bestOpponentAttack.stars) defender.bestOpponentAttack = hit;
    }
  }
  const side = (clan: GroupClan, members: CocWarMember[], against: CocWarMember[]): CocWarClan => ({
    tag: clan.tag,
    name: clan.name,
    clanLevel: clan.level,
    attacks: members.filter((m) => m.attacks?.length).length,
    ...totals(members.flatMap((m) => m.attacks ?? []), against.length),
    members,
  });
  return {
    state: progress === 0 ? 'preparation' : progress < 1 ? 'inWar' : 'warEnded',
    teamSize: TEAM_SIZE,
    preparationStartTime: cocDate(times.prep),
    startTime: cocDate(times.start),
    endTime: cocDate(times.end),
    clan: side(a, sideA, sideB),
    opponent: side(b, sideB, sideA),
  };
}

/**
 * Clan War League seasons, most recent first: the current month's season (in progress during
 * the first days of the month, as in the game) and the `count - 1` previous ones, ended.
 */
export function generateMockCwlSeasons(
  options: { clanTag: string; clanName: string; members: ClanMember[]; now: Date; seed?: number; count?: number },
): CocCwlSeasonRecord[] {
  const rnd = new Random(options.seed ?? 77);
  const now = options.now.getTime();
  const seasons: CocCwlSeasonRecord[] = [];

  for (let s = 0; s < (options.count ?? 3); s++) {
    const monthStart = Date.UTC(options.now.getUTCFullYear(), options.now.getUTCMonth() - s, 1, 8);
    const season = new Date(monthStart).toISOString().slice(0, 7);

    const own: GroupClan = {
      tag: options.clanTag,
      name: options.clanName,
      level: 18,
      roster: options.members.map((m) => ({ tag: m.tag, name: m.name, townHall: m.townHall })),
    };
    const others: GroupClan[] = rnd.shuffle(GROUP_CLANS).slice(0, 7).map((name) => ({
      tag: tag(rnd),
      name,
      level: rnd.int(12, 22),
      roster: Array.from({ length: TEAM_SIZE }, (_, i) => ({ tag: tag(rnd), name: `${name.split(' ')[0]} ${i + 1}`, townHall: rnd.int(14, 17) })),
    }));
    const clans = [own, ...others];

    // Round-robin (circle method): 7 rounds, 4 wars each, every clan meets every other once.
    const rounds: { warTags: string[] }[] = [];
    const wars: CocCwlSeasonRecord['wars'] = [];
    const order = [...clans];
    for (let r = 0; r < ROUNDS; r++) {
      const prep = monthStart + r * DAY;
      const times = { prep, start: prep + DAY, end: prep + 2 * DAY };
      const warTags: string[] = [];
      for (let i = 0; i < 4; i++) {
        if (now < times.prep) {
          warTags.push('#0');
          continue;
        }
        const progress = now >= times.end ? 1 : now >= times.start ? (now - times.start) / DAY : 0;
        const warTag = tag(rnd);
        warTags.push(warTag);
        wars.push({ ...leagueWar(rnd, order[i], order[7 - i], times, progress), warTag });
      }
      rounds.push({ warTags });
      order.splice(1, 0, order.pop()!);
    }

    const ended = wars.length === ROUNDS * 4 && wars.every((w) => w.state === 'warEnded');
    seasons.push({
      season,
      state: ended ? 'ended' : 'inWar',
      clanTag: options.clanTag,
      clans: clans.map((c) => ({
        tag: c.tag,
        name: c.name,
        clanLevel: c.level,
        members: c.roster.map((p) => ({ tag: p.tag, name: p.name, townHallLevel: p.townHall })),
      })),
      rounds,
      wars,
    });
  }
  return seasons;
}

/**
 * Raid Weekends (Friday 07:00 – Monday 07:00 UTC), most recent first; the current one is
 * `ongoing` while the weekend is not over. Like the backend data, past weekends keep their
 * members, except the two oldest ones (before the site started saving them).
 */
export function generateMockRaidSeasons(
  options: { members: ClanMember[]; now: Date; seed?: number; count?: number },
): CocCapitalRaidSeason[] {
  const rnd = new Random(options.seed ?? 99);
  const now = options.now.getTime();
  // Most recent Friday 07:00 UTC not after now.
  const day = new Date(Date.UTC(options.now.getUTCFullYear(), options.now.getUTCMonth(), options.now.getUTCDate(), 7));
  while (day.getUTCDay() !== 5 || day.getTime() > now) day.setUTCDate(day.getUTCDate() - 1);

  return Array.from({ length: options.count ?? 10 }, (_, w) => {
    const start = day.getTime() - w * 7 * DAY;
    const end = start + 3 * DAY;
    const ongoing = now < end;
    const progress = ongoing ? Math.max(0.15, (now - start) / (3 * DAY)) : 1;

    const members = options.members
      .filter((m) => RAID_LOOT[m.name] || rnd.chance(0.8))
      .map((m) => {
        const bonus = rnd.chance(0.3) ? 1 : 0;
        const [min, max] = RAID_LOOT[m.name] ?? [9_000, 26_000];
        const attacks = RAID_LOOT[m.name] ? 5 + bonus : rnd.int(2, 5 + bonus);
        const loot = RAID_LOOT[m.name] ? rnd.int(min, max) : Math.round((rnd.int(min, max) * attacks) / 5);
        return {
          tag: m.tag,
          name: m.name,
          attacks: Math.max(1, Math.round(attacks * progress)),
          attackLimit: 5,
          bonusAttackLimit: bonus,
          capitalResourcesLooted: Math.round(loot * progress),
        };
      });

    return {
      state: ongoing ? 'ongoing' : 'ended',
      startTime: cocDate(start),
      endTime: cocDate(end),
      capitalTotalLoot: members.reduce((s, m) => s + m.capitalResourcesLooted, 0),
      raidsCompleted: Math.round(rnd.int(5, 8) * progress),
      totalAttacks: members.reduce((s, m) => s + m.attacks, 0),
      enemyDistrictsDestroyed: Math.round(rnd.int(30, 48) * progress),
      offensiveReward: ongoing ? 0 : rnd.int(1_300, 1_900),
      defensiveReward: ongoing ? 0 : rnd.int(250, 600),
      // The oldest weekends predate the site: their members were never saved (as with real data).
      ...(w < (options.count ?? 10) - 2 ? { members } : {}),
      attackLog: [],
      defenseLog: [],
    } satisfies CocCapitalRaidSeason;
  });
}

/** Players with a fixed amount of donations per season, so the `donor` medals have something to show. */
const DONATIONS: Record<string, [min: number, max: number]> = {
  'Templare Nero': [10_200, 12_000],
  Excalibur: [7_600, 9_500],
  Ragnar: [5_100, 7_000],
};

/**
 * Game seasons (calendar months from the 1st 08:00 UTC), most recent first, with the troops
 * donated by the members, in the backend format. The first one is in progress.
 */
export function generateMockDonationSeasons(
  options: { members: ClanMember[]; now: Date; seed?: number; count?: number },
): DonationSeason[] {
  const rnd = new Random(options.seed ?? 77);
  const now = options.now.getTime();
  const first = new Date(Date.UTC(options.now.getUTCFullYear(), options.now.getUTCMonth(), 1, 8));
  if (first.getTime() > now) first.setUTCMonth(first.getUTCMonth() - 1);

  return Array.from({ length: options.count ?? 6 }, (_, i) => {
    const start = new Date(first);
    start.setUTCMonth(start.getUTCMonth() - i);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const ongoing = now < end.getTime();
    const progress = ongoing ? Math.max(0.1, (now - start.getTime()) / (end.getTime() - start.getTime())) : 1;
    const players = options.members
      .map((m) => {
        const [min, max] = DONATIONS[m.name] ?? [200, 6_000];
        return { tag: m.tag, name: m.name, donations: Math.round(rnd.int(min, max) * progress) };
      })
      .sort((a, b) => b.donations - a.donations);
    return {
      season: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      state: ongoing ? 'ongoing' : 'ended',
      players,
    };
  });
}
