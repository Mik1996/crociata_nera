import { cssColor } from '../styles/css-color';

/**
 * Surface of a 3D medal, mapped onto `MeshPhysicalMaterial`. Plain data (no Three.js import), so it
 * can be used anywhere without pulling the 3D library into the bundle.
 */
export interface MedalFinishSpec {
  /**
   * Base colour (for metals: the colour of the reflections): a CSS colour or a palette token
   * (`--cn-*`, resolved by {@link resolveFinish}).
   */
  color: string;
  /** 0 = dielectric (plastic, enamel), 1 = metal. */
  metalness: number;
  /** 0 = mirror, 1 = fully matte. */
  roughness: number;
  /** Transparent varnish on top of the metal, 0–1. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** How much the environment map is reflected (default 1). */
  envMapIntensity?: number;
}

/** Built-in finishes; any other medal (another colour, a single medal) passes its own spec. */
export type MedalFinishName = 'bronze' | 'silver' | 'gold' | 'legendary';

export type MedalFinish = MedalFinishName | MedalFinishSpec;

export const MEDAL_FINISHES: Readonly<Record<MedalFinishName, MedalFinishSpec>> = {
  // Polished copper-brown.
  bronze: {
    color: '--cn-medal-3d-bronze',
    metalness: 1,
    roughness: 0.3,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
  },
  // Highly reflective silver.
  silver: {
    color: '--cn-medal-3d-silver',
    metalness: 1,
    roughness: 0.16,
    clearcoat: 0.4,
    clearcoatRoughness: 0.12,
  },
  // Gold with a glossy varnish.
  gold: {
    color: '--cn-medal-3d-gold',
    metalness: 1,
    roughness: 0.2,
    clearcoat: 0.9,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.05,
  },
  // Candy crimson metal under a mirror varnish: the one-off medals of the highest merit.
  legendary: {
    color: '--cn-medal-legendary',
    metalness: 1,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.15,
  },
};

/** A medal not earned yet: dark, matte and almost non-metallic, whatever its finish. */
export const LOCKED_FINISH: MedalFinishSpec = {
  color: '--cn-medal-locked-dark',
  metalness: 0.05,
  roughness: 0.85,
  clearcoat: 0,
  clearcoatRoughness: 1,
  envMapIntensity: 0.4,
};

/**
 * Finish actually rendered: the locked one wins over the medal's own. A palette token is resolved
 * to its colour ('' without the global styles, e.g. in unit tests: the material keeps its default).
 */
export function resolveFinish(finish: MedalFinish, locked: boolean): Required<MedalFinishSpec> {
  const spec = locked ? LOCKED_FINISH : typeof finish === 'string' ? MEDAL_FINISHES[finish] : finish;
  return {
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1,
    ...spec,
    color: spec.color.startsWith('--') ? cssColor(spec.color) : spec.color,
  };
}
