import { Color } from 'three';
import { cssColor } from './css-color';

/**
 * A palette token (`--cn-*`) as a Three.js colour. Kept apart from `css-color.ts` so that the
 * plain helpers do not pull Three.js into the bundle. Without the global styles (unit tests) the
 * token is empty and the colour stays at the Three.js default.
 */
export function paletteColor(token: string): Color {
  return new Color(cssColor(token) || undefined);
}
