/**
 * Clan castle reinforcements of a defense base. Same data as the frontend
 * (`src/app/core/game/clan-castle.ts`): keep the two in sync when the game changes.
 */

/** Troop capacity of the clan castle by town hall level (highest castle level available). */
export const CLAN_CASTLE_CAPACITY: Readonly<Record<number, number>> = {
  3: 10,
  4: 15,
  5: 15,
  6: 20,
  7: 20,
  8: 25,
  9: 30,
  10: 35,
  11: 35,
  12: 40,
  13: 45,
  14: 45,
  15: 50,
  16: 50,
  17: 55,
  18: 55,
};

const KNOWN_LEVELS = Object.keys(CLAN_CASTLE_CAPACITY).map(Number);
const HIGHEST_LEVEL = Math.max(...KNOWN_LEVELS);

/**
 * Troop capacity of the clan castle at a town hall level: none before the castle is rebuilt
 * (TH3); new town halls use the highest known capacity until the table is updated.
 */
export function clanCastleCapacity(townHallLevel: number): number {
  if (townHallLevel < Math.min(...KNOWN_LEVELS)) return 0;
  return CLAN_CASTLE_CAPACITY[Math.min(townHallLevel, HIGHEST_LEVEL)] ?? 0;
}

/** Largest capacity of any clan castle: no troop can be there more times than this. */
export const MAX_CLAN_CASTLE_CAPACITY = Math.max(...Object.values(CLAN_CASTLE_CAPACITY));

/**
 * Housing space of the troops that can defend in the clan castle, by their English name (as in the
 * Clash of Clans API). Siege machines and spells do not defend, so they are not listed.
 */
export const TROOP_HOUSING_SPACE: Readonly<Record<string, number>> = {
  // Elixir troops
  Barbarian: 1,
  Archer: 1,
  Giant: 5,
  Goblin: 1,
  'Wall Breaker': 2,
  Balloon: 5,
  Wizard: 4,
  Healer: 14,
  Dragon: 20,
  'P.E.K.K.A': 25,
  'Baby Dragon': 10,
  Miner: 6,
  'Electro Dragon': 30,
  Yeti: 18,
  'Dragon Rider': 25,
  'Electro Titan': 32,
  'Root Rider': 20,
  Thrower: 16,
  'Meteor Golem': 40,
  // Dark elixir troops
  Minion: 2,
  'Hog Rider': 5,
  Valkyrie: 8,
  Golem: 30,
  Witch: 12,
  'Lava Hound': 30,
  Bowler: 6,
  'Ice Golem': 15,
  Headhunter: 6,
  'Apprentice Warden': 20,
  Druid: 16,
  Furnace: 18,
  'Ruin Witch': 26,
  // Super troops
  'Super Barbarian': 5,
  'Super Archer': 12,
  'Super Giant': 10,
  'Sneaky Goblin': 3,
  'Super Wall Breaker': 8,
  'Rocket Balloon': 8,
  'Super Wizard': 10,
  'Super Dragon': 40,
  'Inferno Dragon': 15,
  'Super Miner': 24,
  'Super Yeti': 35,
  'Super Minion': 12,
  'Super Hog Rider': 12,
  'Super Valkyrie': 20,
  'Super Witch': 40,
  'Ice Hound': 40,
  'Super Bowler': 30,
};

export const TROOP_NAMES = Object.keys(TROOP_HOUSING_SPACE) as [string, ...string[]];

export interface ClanCastleTroop {
  name: string;
  count: number;
}

/** Housing space taken by the troops. */
export function housingSpaceUsed(troops: readonly ClanCastleTroop[]): number {
  return troops.reduce((total, troop) => total + (TROOP_HOUSING_SPACE[troop.name] ?? 0) * troop.count, 0);
}

/** One entry per troop (repeated names are added up), in the order they first appear. */
export function mergeTroops(troops: readonly ClanCastleTroop[]): ClanCastleTroop[] {
  const counts = new Map<string, number>();
  for (const { name, count } of troops) counts.set(name, (counts.get(name) ?? 0) + count);
  return [...counts].map(([name, count]) => ({ name, count }));
}
