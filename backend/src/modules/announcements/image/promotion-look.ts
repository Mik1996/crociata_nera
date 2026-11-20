import { IRON_THEME as T } from './announcement-theme';

/**
 * Look of a promotion picture: the iron frame of the announcements, recoloured by the league
 * reached (blue for the Electro leagues, fire orange for the Legend leagues), more epic at every
 * league: brighter glow, more rays, lightning or embers, more rings.
 */
export interface PromotionLook {
  /** 1 (Electro League 31) … 6 (Legend League I). */
  level: number;
  family: 'electro' | 'legend';
  /** Frame, studs, rules, rings. */
  accent: string;
  /** Titles, rays, sparks. */
  light: string;
  /** Vignette at the edges. */
  deep: string;
}

const FIRST_LEAGUE = 105000031;

export function promotionLook(leagueId: number): PromotionLook {
  const level = Math.min(6, Math.max(1, leagueId - FIRST_LEAGUE + 1));
  return level <= 3
    ? { level, family: 'electro', accent: T.electro, light: T.electroLight, deep: T.electroDeep }
    : { level, family: 'legend', accent: T.legend, light: T.legendLight, deep: T.legendDeep };
}

/** Deterministic random numbers (mulberry32): the same picture at every drawing. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
