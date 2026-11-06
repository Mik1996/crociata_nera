import { CocPlayer, CocPlayerItem } from '../api/coc-api.types';
import { UNIT_ICONS } from '../game/game-assets';
import { isSuperTroop, PETS, SIEGE_MACHINES } from '../game/units';
import { ClanMember } from '../models';
import { Random } from './random';

const HOME_HEROES = ['Barbarian King', 'Archer Queen', 'Minion Prince', 'Grand Warden', 'Royal Champion', 'Dragon Duke'];
const HERO_MAX: Record<string, number> = {
  'Barbarian King': 105,
  'Archer Queen': 105,
  'Minion Prince': 95,
  'Grand Warden': 80,
  'Royal Champion': 55,
  'Dragon Duke': 25,
};
/** Town Hall that unlocks each hero. */
const HERO_TH: Record<string, number> = {
  'Barbarian King': 7,
  'Archer Queen': 8,
  'Minion Prince': 9,
  'Grand Warden': 11,
  'Royal Champion': 13,
  'Dragon Duke': 15,
};
const ACHIEVEMENTS: [name: string, target: number, info: string][] = [
  ['Sweet Victory!', 1250, 'Achieve a total of 1250 trophies in Multiplayer battles'],
  ['War Hero', 1000, 'Score 1000 stars for your clan in Clan War battles'],
  ['Friend in Need', 25000, 'Donate 25000 capacity worth of reinforcements to Clanmates'],
  ['Unbreakable', 5000, 'Successfully defend against 5000 attacks'],
  ['Conqueror', 5000, 'Win 5000 Multiplayer battles'],
  ['Aggressive Capitalism', 100000000, 'Loot 100000000 Capital Gold'],
  ['Most Valuable Clanmate', 40000, 'Contribute 40000 Capital Gold'],
  ['Well Seasoned', 15000, 'Earn 15000 points in Season Challenges'],
];

function seedOf(tag: string): number {
  let h = 2166136261;
  for (const c of tag) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Names of home village units of a kind, taken from the available icons. */
function homeNames(filter: (name: string) => boolean): string[] {
  return Object.keys(UNIT_ICONS)
    .filter((k) => k.startsWith('home|'))
    .map((k) => k.slice(5))
    .filter(filter);
}

/**
 * Deterministic mock of `GET /players/{tag}` for a clan member: levels scale with the Town Hall
 * and with a per-player "progress" factor, so every member gets a plausible, stable profile.
 */
export function mockPlayer(member: ClanMember, clan: { tag: string; name: string; badgeUrl?: string }): CocPlayer {
  const rnd = new Random(seedOf(member.tag));
  const th = Math.max(member.townHall, 7);
  const progress = Math.min(1, (th - 6) / 12) * rnd.range(0.75, 1);
  const level = (max: number) => Math.max(1, Math.min(max, Math.round(max * progress * rnd.range(0.85, 1.05))));
  const item = (name: string, maxLevel: number, village: CocPlayerItem['village'] = 'home'): CocPlayerItem => ({
    name,
    level: level(maxLevel),
    maxLevel,
    village,
  });
  const spells = homeNames((n) => n.endsWith(' Spell'));
  const equipment = homeNames((n) => !n.endsWith(' Spell') && /Puppet|Gem|Vial|Tome|Arrow|Boots|Ball|Bracelet|Mirror|Shield|Gauntlet|Fireball|Fangs|Orb|Pendant/.test(n));
  const troops = homeNames(
    (n) => !n.endsWith(' Spell') && !HOME_HEROES.includes(n) && !equipment.includes(n) && !isSuperTroop(n),
  );
  const heroes = HOME_HEROES.filter((h) => th >= HERO_TH[h]).map((h) => ({
    ...item(h, HERO_MAX[h]),
    equipment: rnd.shuffle(equipment).slice(0, 2).map((e) => item(e, 27)),
  }));

  return {
    tag: member.tag,
    name: member.name,
    townHallLevel: member.townHall,
    townHallWeaponLevel: member.townHall >= 12 && member.townHall <= 17 ? rnd.int(1, 5) : undefined,
    expLevel: member.expLevel,
    trophies: member.trophies,
    bestTrophies: member.trophies + rnd.int(50, 900),
    warStars: Math.round(progress * rnd.int(400, 2200)),
    attackWins: rnd.int(5, 120),
    defenseWins: rnd.int(0, 12),
    builderHallLevel: Math.min(10, Math.max(3, th - 6)),
    builderBaseTrophies: rnd.int(2000, 5200),
    bestBuilderBaseTrophies: rnd.int(5200, 5800),
    role: ({ leader: 'leader', coLeader: 'coLeader', elder: 'admin', member: 'member' } as const)[member.role],
    warPreference: rnd.chance(0.8) ? 'in' : 'out',
    donations: member.donations,
    donationsReceived: member.donationsReceived,
    clanCapitalContributions: rnd.int(50_000, 4_000_000),
    clan: { tag: clan.tag, name: clan.name, clanLevel: 18, badgeUrls: clan.badgeUrl ? { medium: clan.badgeUrl } : undefined },
    labels: [],
    heroes: [...heroes, item('Battle Machine', 35, 'builderBase'), item('Battle Copter', 35, 'builderBase')],
    troops: [
      ...troops.filter((t) => !SIEGE_MACHINES.has(t) && !PETS.has(t)).map((t) => item(t, 12)),
      ...troops.filter((t) => SIEGE_MACHINES.has(t)).map((t) => item(t, 5)),
      ...troops.filter((t) => PETS.has(t)).map((t) => item(t, 10)),
      ...['Super Barbarian', 'Super Archer', 'Super Wizard'].map((t, i) => ({ ...item(t, 12), superTroopIsActive: i === 0 })),
    ],
    spells: spells.map((s) => item(s, 11)),
    heroEquipment: equipment.map((e) => item(e, 27)),
    achievements: ACHIEVEMENTS.map(([name, target, info]) => {
      const value = Math.round(target * progress * rnd.range(0.4, 1.6));
      return { name, stars: value >= target ? 3 : value >= target / 2 ? 2 : value >= target / 5 ? 1 : 0, value, target, info, village: 'home' as const };
    }),
  };
}
