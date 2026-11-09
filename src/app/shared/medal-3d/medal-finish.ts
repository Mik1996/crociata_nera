/**
 * Surface of a 3D medal, mapped onto `MeshPhysicalMaterial`. Plain data (no Three.js import), so it
 * can be used anywhere without pulling the 3D library into the bundle.
 */
export interface MedalFinishSpec {
  /** Base colour (for metals: the colour of the reflections). */
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
export type MedalFinishName = 'bronze' | 'silver' | 'gold';

export type MedalFinish = MedalFinishName | MedalFinishSpec;

export const MEDAL_FINISHES: Readonly<Record<MedalFinishName, MedalFinishSpec>> = {
  // Polished copper-brown.
  bronze: {
    color: '#c47a4c',
    metalness: 1,
    roughness: 0.3,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
  },
  // Highly reflective silver.
  silver: {
    color: '#e8ebf0',
    metalness: 1,
    roughness: 0.16,
    clearcoat: 0.4,
    clearcoatRoughness: 0.12,
  },
  // Gold with a glossy varnish.
  gold: {
    color: '#f7c552',
    metalness: 1,
    roughness: 0.2,
    clearcoat: 0.9,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.05,
  },
};

/** A medal not earned yet: dark, matte and almost non-metallic, whatever its finish. */
export const LOCKED_FINISH: MedalFinishSpec = {
  color: '#2a2d34',
  metalness: 0.05,
  roughness: 0.85,
  clearcoat: 0,
  clearcoatRoughness: 1,
  envMapIntensity: 0.4,
};

/** Finish actually rendered: the locked one wins over the medal's own. */
export function resolveFinish(finish: MedalFinish, locked: boolean): Required<MedalFinishSpec> {
  const spec = locked ? LOCKED_FINISH : typeof finish === 'string' ? MEDAL_FINISHES[finish] : finish;
  return {
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1,
    ...spec,
  };
}
