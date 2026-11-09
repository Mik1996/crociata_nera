import { FACE_RADIUS } from './medal-geometry';
import { parseMedalDecorations, svgToMedal } from './medal-decorations';

// A gold medal, trimmed: rays, laurel, studs, disc, dashed ring, icon, gem with facets, glints.
const GOLD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 64 64">
  <defs><radialGradient id="rays"/></defs>
  <path d="M29.26 18.32 L32.00 -1.80 L34.74 18.32 Z M43.68 27.26 L63.80 30.00 L43.68 32.74 Z" fill="url(#rays)"/>
  <g><ellipse cx="44.77" cy="54.02" rx="4.20" ry="1.89" transform="rotate(127.0 44.77 54.02)"/><ellipse cx="19.23" cy="54.02" rx="4.20" ry="1.89" transform="rotate(53.0 19.23 54.02)"/></g>
  <circle cx="32" cy="31.2" r="24.6" fill="#000" opacity="0.35"/>
  <circle cx="32" cy="30" r="24" fill="#f1bd2c"/>
  <circle cx="53.25" cy="35.69" r="1" fill="#fff6c2"/>
  <circle cx="26.31" cy="8.75" r="1" fill="#fff6c2"/>
  <circle cx="32" cy="30" r="19.5" fill="#f1bd2c"/>
  <circle cx="32" cy="30" r="17.5" fill="none" stroke="#fff6c2" stroke-dasharray="1.2 1.6"/>
  <g transform="translate(32 30) scale(0.8) translate(-32 -30)"><path d="M18 38 L32 17 Z"/></g>
  <path d="M32 1.5 L36 6 L32 10.5 L28 6 Z" fill="#e53935" stroke="#0b1220"/><path d="M32 1.5 L36 6 L32 6 Z" fill="#ffc2c2"/>
  <path d="M13.20,9.00L10.63,9.63L10.00,12.20L9.37,9.63L6.80,9.00L9.37,8.37L10.00,5.80L10.63,8.37Z" fill="#fffbe0"/>
</svg>`;

describe('svgToMedal', () => {
  it('maps the face disc to the face, the ring to the rim and keeps y up', () => {
    expect(svgToMedal(32, 30)).toEqual({ x: 0, y: 0 });
    expect(svgToMedal(32 + 19.5, 30).x).toBeCloseTo(FACE_RADIUS);
    expect(svgToMedal(32, 30 - 24).y).toBeCloseTo(1);
    expect(svgToMedal(32, 30 + 48).y).toBeCloseTo(-2);
  });
});

describe('parseMedalDecorations', () => {
  it('reads laurel, studs, gem, glints and rays from a gold medal', () => {
    const d = parseMedalDecorations(GOLD);

    expect(d.leaves).toHaveLength(2);
    expect(d.leaves[0].x).toBeGreaterThan(0);
    expect(d.leaves[0].y).toBeLessThan(-0.9);
    expect(d.leaves[0].angle).toBeCloseTo((-127 * Math.PI) / 180);
    expect(d.leaves[0].rx).toBeCloseTo(4.2 / 24);

    // Small circles on the ring only: not the shadow, the disc or the dashed ring.
    expect(d.studs).toHaveLength(2);
    for (const s of d.studs) {
      expect(Math.hypot(s.x, s.y)).toBeGreaterThan(FACE_RADIUS);
      expect(Math.hypot(s.x, s.y)).toBeLessThan(1);
    }

    // The facet highlight of the gem is not another glint.
    expect(d.gems).toEqual([
      expect.objectContaining({ x: 0, color: '#e53935', halfWidth: 4 / 24, halfHeight: 4.5 / 24 }),
    ]);
    expect(d.gems[0].y).toBeCloseTo(1);
    expect(d.sparkles).toHaveLength(1);
    expect(d.sparkles[0].x).toBeLessThan(0);
    expect(d.sparkles[0].y).toBeGreaterThan(0);

    expect(d.rays).toHaveLength(2);
    expect(d.rays[0]).toHaveLength(3);
    // The tip of the top ray is beyond the rim.
    expect(Math.max(...d.rays[0].map((p) => p.y))).toBeGreaterThan(1.2);
  });

  it('finds nothing on a plain bronze medal', () => {
    const bronze = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="30" r="24"/><circle cx="32" cy="30" r="19.5"/></svg>`;
    expect(parseMedalDecorations(bronze)).toEqual({ leaves: [], studs: [], gems: [], sparkles: [], rays: [] });
  });
});
