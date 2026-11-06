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
 * Super troops without the "Super" prefix. The API lists super troops among the troops and only
 * sometimes adds `superTroopIsActive`, so they are recognised by name.
 */
const SUPER_TROOPS_WITHOUT_PREFIX: ReadonlySet<string> = new Set(['Sneaky Goblin', 'Rocket Balloon', 'Inferno Dragon', 'Ice Hound']);

export function isSuperTroop(name: string): boolean {
  return name.startsWith('Super ') || SUPER_TROOPS_WITHOUT_PREFIX.has(name);
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
