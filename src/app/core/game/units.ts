import { Village } from '../models';
import { TOWN_HALL_IMAGES, UNIT_ICONS } from './game-assets';

/** Siege machines: the API lists them among the troops. */
export const SIEGE_MACHINES: ReadonlySet<string> = new Set([
  'Wall Wrecker',
  'Battle Blimp',
  'Stone Slammer',
  'Siege Barracks',
  'Log Launcher',
  'Flame Flinger',
  'Battle Drill',
  'Troop Launcher',
  'Sky Wagon',
]);

/**
 * Base troop of each super troop. In the game a super troop has the level of its base troop,
 * while the API reports a fixed level (usually 1).
 */
export const SUPER_TROOP_BASE: Readonly<Record<string, string>> = {
  'Super Barbarian': 'Barbarian',
  'Super Archer': 'Archer',
  'Super Giant': 'Giant',
  'Sneaky Goblin': 'Goblin',
  'Super Wall Breaker': 'Wall Breaker',
  'Rocket Balloon': 'Balloon',
  'Super Wizard': 'Wizard',
  'Super Dragon': 'Dragon',
  'Inferno Dragon': 'Baby Dragon',
  'Super Minion': 'Minion',
  'Super Valkyrie': 'Valkyrie',
  'Super Witch': 'Witch',
  'Ice Hound': 'Lava Hound',
  'Super Bowler': 'Bowler',
  'Super Miner': 'Miner',
  'Super Hog Rider': 'Hog Rider',
  'Super Yeti': 'Yeti',
};

/**
 * The API lists super troops among the troops and only sometimes adds `superTroopIsActive`,
 * so they are recognised by name (future ones are caught by the "Super " prefix).
 */
export function isSuperTroop(name: string): boolean {
  return name in SUPER_TROOP_BASE || name.startsWith('Super ');
}

/** Hero pets: the API lists them among the troops. */
export const PETS: ReadonlySet<string> = new Set([
  'L.A.S.S.I',
  'Mighty Yak',
  'Electro Owl',
  'Unicorn',
  'Phoenix',
  'Poison Lizard',
  'Diggy',
  'Frosty',
  'Spirit Fox',
  'Angry Jelly',
  'Sneezy',
  'Greedy Raven',
]);

/** Icon of a unit, if the game assets include it. */
export function unitIcon(village: Village, name: string): string | undefined {
  return UNIT_ICONS[`${village}|${name}`];
}

/** Town Hall image (falls back to the highest available level). */
export function townHallImage(level: number): string | undefined {
  const levels = Object.keys(TOWN_HALL_IMAGES).map(Number);
  const best = Math.min(Math.max(level, Math.min(...levels)), Math.max(...levels));
  return TOWN_HALL_IMAGES[best];
}
