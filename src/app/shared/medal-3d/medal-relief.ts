/**
 * Icon relief of a 3D medal: the central icon of the flat SVG medal becomes a height map, then a
 * normal map (embossed look that follows the convex face without touching the geometry) and a
 * roughness map (the icon is more polished than the field around it).
 *
 * Only the browser part (`rasterizeSvg`) needs a DOM canvas; the rest is pure and tested.
 */

/** Centre and radius, in the coordinates of the medal SVGs (viewBox `0 -2 64 64`), of the face disc. */
const SVG_FACE = { cx: 32, cy: 30, r: 19.5 } as const;

/** The central icon of the medal SVGs: a root `<g>` scaled around the centre of the disc. */
const ICON_TRANSFORM = /^translate\(32 30\) scale\(/;

/**
 * SVG of the face decoration alone, framed on the face disc: the central icon and the dashed
 * rings around it. The icon is the element marked `data-medal-icon` or, in the current medals,
 * the root group `translate(32 30) scale(...)` (the shadow copy is nested in another group);
 * without either, the whole image is used.
 */
export function extractIconSvg(svgText: string): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg') throw new Error('Not an SVG image');

  const icon =
    root.querySelector('[data-medal-icon]') ??
    Array.from(root.children).find(
      (el) => el.nodeName === 'g' && ICON_TRANSFORM.test(el.getAttribute('transform') ?? ''),
    );
  if (!icon) return new XMLSerializer().serializeToString(root);

  // Dashed rings engraved on the face (drawn fully opaque: the relief decides how they look).
  const rings = Array.from(root.children).filter(
    (el) => el.nodeName === 'circle' && el.hasAttribute('stroke-dasharray'),
  );
  for (const ring of rings) ring.removeAttribute('opacity');

  const defs = root.querySelector('defs');
  const { cx, cy, r } = SVG_FACE;
  const serializer = new XMLSerializer();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx - r} ${cy - r} ${2 * r} ${2 * r}">` +
    (defs ? serializer.serializeToString(defs) : '') +
    [...rings, icon].map((el) => serializer.serializeToString(el)).join('') +
    '</svg>'
  );
}

/** Draws an SVG on a square canvas and returns its RGBA pixels (row 0 at the top). */
export async function rasterizeSvg(svgText: string, size: number): Promise<Uint8ClampedArray> {
  // Explicit size: some browsers draw a viewBox-only SVG at 0×0 or 150×150.
  const sized = svgText.replace('<svg ', `<svg width="${size}" height="${size}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas not available');
    ctx.drawImage(image, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Pixels of the icon in texture order (row 0 at the **bottom**): coverage and luminance, 0–1. */
export interface IconCoverage {
  alpha: Float32Array;
  luminance: Float32Array;
}

export function coverageFromPixels(rgba: Uint8ClampedArray, size: number): IconCoverage {
  const alpha = new Float32Array(size * size);
  const luminance = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size;
    for (let x = 0; x < size; x++) {
      const i = (src + x) * 4;
      alpha[y * size + x] = rgba[i + 3] / 255;
      luminance[y * size + x] =
        (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    }
  }
  return { alpha, luminance };
}

/**
 * Height (0–1): the shape stands out from the field and its light details (highlights, inner
 * lines) a bit more.
 */
export function heightFromCoverage({ alpha, luminance }: IconCoverage): Float32Array {
  return alpha.map((a, i) => a * (0.7 + 0.3 * luminance[i]));
}

/** Height straight from the pixels ({@link coverageFromPixels} + {@link heightFromCoverage}). */
export function heightFromPixels(rgba: Uint8ClampedArray, size: number): Float32Array {
  return heightFromCoverage(coverageFromPixels(rgba, size));
}

/**
 * Colour multiplier of the face (RGBA, linear, row 0 at the bottom): the decoration is a darker
 * shade of the medal metal, its light details a bit less dark so they stay readable.
 */
export function toneMapFromCoverage(
  { alpha, luminance }: IconCoverage,
  size: number,
  darkness = 0.62,
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.round(255 * (1 - alpha[i] * darkness * (1 - 0.45 * luminance[i])));
    out.set([value, value, value, 255], i * 4);
  }
  return out;
}

/**
 * Colour of the face (RGBA, sRGB, row 0 at the bottom) of a medal whose decoration is made of a
 * second metal: the field keeps the `base` colour, the decoration takes the `accent` one (its dark
 * details a bit darker, so the outlines stay readable). Colours are sRGB triples, 0–1.
 */
export function accentMapFromCoverage(
  { alpha, luminance }: IconCoverage,
  size: number,
  base: readonly [number, number, number],
  accent: readonly [number, number, number],
): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const shade = 0.55 + 0.45 * luminance[i];
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.round(255 * (base[c] + (accent[c] * shade - base[c]) * alpha[i]));
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Height as a grey texture (displacement map: Three.js reads the red channel). */
export function displacementMapFromHeight(height: Float32Array, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.round(255 * Math.min(1, height[i]));
    out.set([value, value, value, 255], i * 4);
  }
  return out;
}

/** Separable box blur, repeated: rounds the edges of the relief like a minted bevel. */
export function blur(values: Float32Array, size: number, radius: number, passes = 2): Float32Array {
  if (radius < 1) return values;
  let src: Float32Array = values;
  let dst: Float32Array = new Float32Array(values.length);
  const window = 2 * radius + 1;
  for (let pass = 0; pass < passes; pass++) {
    for (const horizontal of [true, false]) {
      for (let line = 0; line < size; line++) {
        const at = (k: number) => {
          const c = Math.min(size - 1, Math.max(0, k));
          return horizontal ? line * size + c : c * size + line;
        };
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += src[at(k)];
        for (let k = 0; k < size; k++) {
          dst[at(k)] = sum / window;
          sum += src[at(k + radius + 1)] - src[at(k - radius)];
        }
      }
      [src, dst] = [dst, src];
    }
  }
  return src;
}

/**
 * Tangent-space normal map (RGBA, row 0 at the bottom) of a height map. `depth` is the relief
 * height in UV units: 0.02 is a coin-like embossing.
 */
export function normalMapFromHeight(height: Float32Array, size: number, depth: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const scale = (depth * size) / 2;
  const h = (x: number, y: number) =>
    height[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = -(h(x + 1, y) - h(x - 1, y)) * scale;
      const ny = -(h(x, y + 1) - h(x, y - 1)) * scale;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Roughness map (Three.js reads the green channel, multiplied by the material roughness):
 * the field keeps the material roughness, the raised icon is `polish` times smoother.
 */
export function roughnessMapFromHeight(height: Float32Array, size: number, polish = 0.45): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.round(255 * (1 - polish * Math.min(1, height[i] / 0.7)));
    out.set([value, value, value, 255], i * 4);
  }
  return out;
}

export interface MedalReliefMaps {
  size: number;
  normal: Uint8Array;
  roughness: Uint8Array;
  /** Colour multiplier: darker decoration. */
  tone: Uint8Array;
  /** Where the decoration is, for the medals that make it of a second metal. */
  coverage: IconCoverage;
  /** Height for the real extrusion of the decoration (vertex displacement). */
  displacement: Uint8Array;
}

/** Relief maps of the face decoration of a medal SVG (fetched by the caller). */
export async function createReliefMaps(svgText: string, size = 1024): Promise<MedalReliefMaps> {
  const pixels = await rasterizeSvg(extractIconSvg(svgText), size);
  const coverage = coverageFromPixels(pixels, size);
  const height = blur(heightFromCoverage(coverage), size, Math.max(1, Math.round(size / 300)));
  const softCoverage = {
    alpha: blur(coverage.alpha, size, 1, 1),
    luminance: coverage.luminance,
  };
  return {
    size,
    normal: normalMapFromHeight(height, size, 0.055),
    roughness: roughnessMapFromHeight(height, size),
    tone: toneMapFromCoverage(softCoverage, size),
    coverage: softCoverage,
    displacement: displacementMapFromHeight(blur(height, size, Math.round(size / 256)), size),
  };
}
