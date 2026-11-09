import { BufferGeometry, LatheGeometry, Vector2 } from 'three';

/**
 * Procedural medal (radius 1, face towards +Z) built with `LatheGeometry`: a thin rounded rim, a
 * groove and a clearly convex face, Apple Health style. The back curves the same way as the face,
 * like a spectacle lens (meniscus): concave, its centre closer to the front than its border. Two meshes share the same outline:
 * the face (the only part with planar UVs, for the icon relief) and the body (rim, edge, back).
 */

/** Radius of the convex face, where the icon is drawn (the rim takes the rest, up to 1). */
export const FACE_RADIUS = 0.84;

const RIM_HALF_HEIGHT = 0.1;
/** Height of the face border (bottom of the groove) and of the domes over it. */
const FACE_BASE = 0.06;
const FRONT_DOME = 0.11;
/** Negative: the back is hollowed towards the front instead of bulging out. */
const BACK_DOME = -0.085;
/** Rings of the face: dense enough for the icon to be displaced, not only shaded. */
const FACE_RINGS = 150;
const SEGMENTS = 256;

/** Points of an arc (angles in degrees), `steps` segments, start and end included. */
function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number): Vector2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return new Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
}

/** Convex dome from the face border to the centre (smooth cosine bulge, flat at the top). */
function dome(height: number, steps: number): Vector2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const r = FACE_RADIUS * (1 - i / steps);
    const t = r / FACE_RADIUS;
    return new Vector2(r, FACE_BASE + height * Math.cos((t * Math.PI) / 2));
  });
}

/** From the edge (radius 1, height 0) up to the face border: rounded edge, rim, groove. */
function rim(): Vector2[] {
  const edgeRadius = RIM_HALF_HEIGHT;
  return [
    ...arc(1 - edgeRadius, 0, edgeRadius, 0, 90, 18),
    // Inner shoulder of the rim, then down into the groove.
    ...arc(0.88, RIM_HALF_HEIGHT - 0.025, 0.025, 90, 180, 6),
    new Vector2(0.85, FACE_BASE + 0.005),
    new Vector2(FACE_RADIUS, FACE_BASE),
  ];
}

/**
 * Outline of half of the medal, from the edge to the centre of a side, as (radius, height).
 * Exported for the tests.
 */
export function halfProfile(domeHeight: number, domeSteps = 48): Vector2[] {
  return [...rim(), ...dome(domeHeight, domeSteps).slice(1)];
}

/**
 * Outlines for the two lathes. `LatheGeometry` points the normals outwards when the outline goes
 * from the bottom to the top (back centre → edge → front centre), so the order matters.
 */
export function medalProfiles(): { body: Vector2[]; face: Vector2[] } {
  const back = halfProfile(BACK_DOME)
    .map((p) => new Vector2(p.x, -p.y))
    .reverse();
  const front = halfProfile(FRONT_DOME, FACE_RINGS);
  const faceStart = front.findIndex((p) => p.x === FACE_RADIUS && p.y === FACE_BASE);
  return {
    // Back + rim + edge, up to the face border.
    body: [...back, ...front.slice(1, faceStart + 1)],
    // Convex face, from the border to the centre.
    face: front.slice(faceStart),
  };
}

/** Height of the front surface at a radius of the rim (where studs and gems sit). */
export function frontHeightAt(radius: number): number {
  const front = rim();
  for (let i = 1; i < front.length; i++) {
    const [a, b] = [front[i - 1], front[i]];
    if ((radius - a.x) * (radius - b.x) <= 0 && a.x !== b.x) {
      return a.y + ((b.y - a.y) * (radius - a.x)) / (b.x - a.x);
    }
  }
  return radius >= 1 ? 0 : FACE_BASE;
}

/** Lathe around Y turned so that the medal axis is Z (the face looks at +Z). */
function lathe(points: Vector2[]): BufferGeometry {
  const geometry = new LatheGeometry(points, SEGMENTS);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Medal body: rim, edge and back. */
export function createBodyGeometry(): BufferGeometry {
  return lathe(medalProfiles().body);
}

/**
 * Convex face with planar UVs: (0, 0)–(1, 1) covers the square around the face disc, so the icon
 * texture follows the bulge without being wrapped around the lathe.
 */
export function createFaceGeometry(): BufferGeometry {
  const geometry = lathe(medalProfiles().face);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    uv.setXY(
      i,
      0.5 + position.getX(i) / (2 * FACE_RADIUS),
      0.5 + position.getY(i) / (2 * FACE_RADIUS),
    );
  }
  uv.needsUpdate = true;
  return geometry;
}
