/**
 * Colours of the palette (`src/styles/_color-palette.scss`) read at runtime, for the code that
 * cannot use `var(--cn-*)` directly: Three.js materials and lights, canvas gradients.
 *
 * The tokens live on the root element, so they are available once the global styles are loaded
 * (always the case when a 3D scene or a canvas texture is built). Without the styles (unit tests in
 * jsdom) every function returns an empty string: callers treat it as "no colour".
 */

/** Value of a palette token, e.g. `cssColor('--cn-gold')`; '' when it is not defined. */
export function cssColor(token: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

/**
 * A palette token at an opacity from 0 to 1, as a plain colour string that canvas gradients accept
 * (`#rrggbbaa` for hex tokens, `color-mix()` otherwise); '' when the token is not defined.
 */
export function cssColorAlpha(token: string, alpha: number): string {
  const value = cssColor(token);
  if (!value) return '';
  const hex = expandHex(value);
  const opacity = Math.min(1, Math.max(0, alpha));
  if (hex) {
    return hex + Math.round(opacity * 255).toString(16).padStart(2, '0');
  }
  return `color-mix(in srgb, ${value} ${+(opacity * 100).toFixed(2)}%, transparent)`;
}

/** `#rgb` / `#rrggbb` as lowercase `#rrggbb`; null for any other notation. */
function expandHex(value: string): string | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return '#' + (digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits);
}
