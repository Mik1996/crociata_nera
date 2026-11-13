import {
  accentMapFromCoverage,
  blur,
  coverageFromPixels,
  displacementMapFromHeight,
  extractIconSvg,
  heightFromPixels,
  normalMapFromHeight,
  roughnessMapFromHeight,
  toneMapFromCoverage,
} from './medal-relief';

const MEDAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 64 64">
  <defs><linearGradient id="emb"><stop offset="0" stop-color="#a97a26"/></linearGradient></defs>
  <circle cx="32" cy="30" r="24" fill="#f1bd2c"/>
  <circle id="dashes" cx="32" cy="30" r="17.5" fill="none" stroke="#fff6c2" stroke-dasharray="1.2 1.6" opacity="0.7"/>
  <g transform="translate(0 1)" opacity="0.35"><g transform="translate(32 30) scale(0.8) translate(-32 -30)"><path id="shadow" d="M0 0"/></g></g>
  <g transform="translate(32 30) scale(0.8) translate(-32 -30)"><path id="icon" d="M18 38 L32 17 Z" fill="url(#emb)"/></g>
</svg>`;

describe('extractIconSvg', () => {
  it('keeps only the central icon (not its shadow) and the dashed ring, framed on the face', () => {
    const svg = extractIconSvg(MEDAL);
    expect(svg).toContain('id="icon"');
    expect(svg).not.toContain('id="shadow"');
    expect(svg).toContain('id="dashes"');
    // Drawn opaque: the relief decides how it looks.
    expect(svg).not.toContain('opacity="0.7"');
    expect(svg).not.toContain('r="24"');
    expect(svg).toContain('id="emb"');
    expect(svg).toContain('viewBox="12.5 10.5 39 39"');
  });

  it('prefers an element marked data-medal-icon, and falls back to the whole image', () => {
    const marked = `<svg xmlns="http://www.w3.org/2000/svg"><rect id="bg"/><path id="star" data-medal-icon="" d="M0 0"/></svg>`;
    expect(extractIconSvg(marked)).toContain('id="star"');
    expect(extractIconSvg(marked)).not.toContain('id="bg"');

    const plain = `<svg xmlns="http://www.w3.org/2000/svg"><rect id="bg"/></svg>`;
    expect(extractIconSvg(plain)).toContain('id="bg"');
  });
});

describe('relief maps', () => {
  it('turns opaque pixels into height, flipping rows to texture order', () => {
    // 2×2: only the top-left pixel is opaque white.
    const rgba = new Uint8ClampedArray(16);
    rgba.set([255, 255, 255, 255], 0);
    const height = heightFromPixels(rgba, 2);
    // Row 0 of the texture is the bottom of the image.
    expect(Array.from(height)).toEqual([0, 0, 1, 0]);
  });

  it('leaves a flat surface flat and tilts the normals away from a bump', () => {
    const size = 8;
    const flat = normalMapFromHeight(new Float32Array(size * size).fill(0.5), size, 0.03);
    expect(Array.from(flat.slice(0, 4))).toEqual([128, 128, 255, 255]);

    // Height rising to the right: the normal leans left (red below 128).
    const ramp = new Float32Array(size * size).map((_, i) => (i % size) / size);
    const normal = normalMapFromHeight(ramp, size, 0.03);
    const middle = (3 * size + 3) * 4;
    expect(normal[middle]).toBeLessThan(128);
    expect(normal[middle + 1]).toBe(128);
  });

  it('blurs without changing a constant field', () => {
    const values = new Float32Array(16 * 16).fill(0.7);
    for (const v of blur(values, 16, 3)) expect(v).toBeCloseTo(0.7);
  });

  it('paints the decoration with the second metal and leaves the field in the medal colour', () => {
    // Field, dark outline of the decoration, light body of the decoration.
    const coverage = {
      alpha: new Float32Array([0, 1, 1, 0.5]),
      luminance: new Float32Array([0, 0, 1, 1]),
    };
    const map = accentMapFromCoverage(coverage, 2, [1, 0, 0], [1, 0.8, 0]);
    const pixel = (i: number) => Array.from(map.slice(i * 4, i * 4 + 4));
    expect(pixel(0)).toEqual([255, 0, 0, 255]); // field: the medal colour
    expect(pixel(2)).toEqual([255, 204, 0, 255]); // decoration: the second metal
    // Outline: the same metal, darker.
    expect(pixel(1)[0]).toBeLessThan(255);
    expect(pixel(1)[1]).toBeGreaterThan(0);
    expect(pixel(1)[1]).toBeLessThan(204);
    // Soft edge: half way between the two.
    expect(pixel(3)).toEqual([255, 102, 0, 255]);
  });

  it('darkens the decoration, its light details less, and leaves the field untouched', () => {
    // Field, dark shape, light detail.
    const coverage = {
      alpha: new Float32Array([0, 1, 1, 0]),
      luminance: new Float32Array([0, 0.3, 1, 0]),
    };
    const tone = toneMapFromCoverage(coverage, 2);
    expect(tone[0]).toBe(255);
    expect(tone[4]).toBeLessThan(tone[8]);
    expect(tone[8]).toBeLessThan(255);
  });

  it('reads coverage in texture order and turns height into a displacement map', () => {
    const rgba = new Uint8ClampedArray(16);
    rgba.set([255, 255, 255, 255], 0);
    expect(Array.from(coverageFromPixels(rgba, 2).alpha)).toEqual([0, 0, 1, 0]);
    expect(Array.from(displacementMapFromHeight(new Float32Array([0, 0.5, 1, 2]), 2).filter((_, i) => i % 4 === 0))).toEqual([
      0, 128, 255, 255,
    ]);
  });

  it('makes the raised icon smoother than the field', () => {
    const roughness = roughnessMapFromHeight(new Float32Array([0, 1, 0, 0]), 2);
    expect(roughness[1]).toBe(255);
    expect(roughness[5]).toBeLessThan(255);
  });
});
