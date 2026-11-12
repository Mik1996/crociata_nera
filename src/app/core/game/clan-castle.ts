import { unitIcon } from './units';

/**
 * Clan castle reinforcements of a defense base. Same data as the backend
 * (`backend/src/modules/bases/clan-castle.ts`): keep the two in sync when the game changes.
 */

export interface ClanCastleTroop {
  /** English name, as in the Clash of Clans API. */
  name: string;
  count: number;
}

export type TroopGroup = 'elixir' | 'dark' | 'super';

export interface TroopInfo {
  name: string;
  housingSpace: number;
  group: TroopGroup;
  icon: string | undefined;
}

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

/**
 * Troop capacity of the clan castle at a town hall level: none before the castle is rebuilt
 * (TH3); new town halls use the highest known capacity until the table is updated.
 */
export function clanCastleCapacity(townHallLevel: number): number {
  if (townHallLevel < Math.min(...KNOWN_LEVELS)) return 0;
  return CLAN_CASTLE_CAPACITY[Math.min(townHallLevel, Math.max(...KNOWN_LEVELS))] ?? 0;
}

const TROOPS: [group: TroopGroup, name: string, housingSpace: number][] = [
  ['elixir', 'Barbarian', 1],
  ['elixir', 'Archer', 1],
  ['elixir', 'Giant', 5],
  ['elixir', 'Goblin', 1],
  ['elixir', 'Wall Breaker', 2],
  ['elixir', 'Balloon', 5],
  ['elixir', 'Wizard', 4],
  ['elixir', 'Healer', 14],
  ['elixir', 'Dragon', 20],
  ['elixir', 'P.E.K.K.A', 25],
  ['elixir', 'Baby Dragon', 10],
  ['elixir', 'Miner', 6],
  ['elixir', 'Electro Dragon', 30],
  ['elixir', 'Yeti', 18],
  ['elixir', 'Dragon Rider', 25],
  ['elixir', 'Electro Titan', 32],
  ['elixir', 'Root Rider', 20],
  ['elixir', 'Thrower', 16],
  ['elixir', 'Meteor Golem', 40],
  ['dark', 'Minion', 2],
  ['dark', 'Hog Rider', 5],
  ['dark', 'Valkyrie', 8],
  ['dark', 'Golem', 30],
  ['dark', 'Witch', 12],
  ['dark', 'Lava Hound', 30],
  ['dark', 'Bowler', 6],
  ['dark', 'Ice Golem', 15],
  ['dark', 'Headhunter', 6],
  ['dark', 'Apprentice Warden', 20],
  ['dark', 'Druid', 16],
  ['dark', 'Furnace', 18],
  ['dark', 'Ruin Witch', 26],
  ['super', 'Super Barbarian', 5],
  ['super', 'Super Archer', 12],
  ['super', 'Super Giant', 10],
  ['super', 'Sneaky Goblin', 3],
  ['super', 'Super Wall Breaker', 8],
  ['super', 'Rocket Balloon', 8],
  ['super', 'Super Wizard', 10],
  ['super', 'Super Dragon', 40],
  ['super', 'Inferno Dragon', 15],
  ['super', 'Super Miner', 24],
  ['super', 'Super Yeti', 35],
  ['super', 'Super Minion', 12],
  ['super', 'Super Hog Rider', 12],
  ['super', 'Super Valkyrie', 20],
  ['super', 'Super Witch', 40],
  ['super', 'Ice Hound', 40],
  ['super', 'Super Bowler', 30],
];

/**
 * Troops that can defend in the clan castle, in the game's order (siege machines and spells do not
 * defend, so they are left out).
 */
export const CLAN_CASTLE_TROOPS: readonly TroopInfo[] = TROOPS.map(([group, name, housingSpace]) => ({
  name,
  housingSpace,
  group,
  icon: unitIcon('home', name),
}));

const BY_NAME = new Map(CLAN_CASTLE_TROOPS.map((troop) => [troop.name, troop]));

export function troopInfo(name: string): TroopInfo | undefined {
  return BY_NAME.get(name);
}

/** Housing space taken by the troops. */
export function housingSpaceUsed(troops: readonly ClanCastleTroop[]): number {
  return troops.reduce((total, t) => total + (BY_NAME.get(t.name)?.housingSpace ?? 0) * t.count, 0);
}
