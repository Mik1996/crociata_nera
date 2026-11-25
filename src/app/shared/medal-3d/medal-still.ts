/**
 * Still 3D medals pre-rendered at build time (`npm run medals`, `scripts/render-medal-stills.mjs`):
 * the lists of medals show them as plain pictures, without Three.js; the dialog shows one while its
 * interactive medal gets ready.
 */

/** Framing shared by all the still medals: room for rays and laurel, coins of equal size. */
export const STILL_EXTENT = 1.32;

/** Side of a pre-rendered still in pixels: sharp up to 128 CSS pixels on a 2x screen. */
export const STILL_PIXELS = 256;

/** Folder of the pre-rendered stills, next to the flat SVGs (`public/commendations/3d/`). */
const STILLS_FOLDER = '3d/';

/**
 * Pre-rendered still of a flat medal SVG: `commendations/wall-gold.svg` →
 * `commendations/3d/wall-gold.webp` (`-locked.webp` for a medal not earned yet).
 */
export function medalStillUrl(svgUrl: string, locked: boolean): string {
  const slash = svgUrl.lastIndexOf('/') + 1;
  const name = svgUrl.slice(slash).replace(/\.svg$/, '');
  return `${svgUrl.slice(0, slash)}${STILLS_FOLDER}${name}${locked ? '-locked' : ''}.webp`;
}
