import { FACE_RADIUS } from './medal-geometry';

/**
 * Decorations around the face of a flat medal SVG, read from the image itself (so new medals get
 * them without code changes) and converted to medal coordinates: radius 1 = outer edge of the
 * rim, y up. Which ones a medal has depends on its SVG (in the current set: bronze none,
 * silver laurel and gem, gold also rays, studs and sparkles).
 */
export interface MedalDecorations {
  /** Laurel leaves: flattened ellipsoids behind the rim. `angle` in radians, counter-clockwise. */
  leaves: { x: number; y: number; rx: number; ry: number; angle: number }[];
  /** Studs on the rim. */
  studs: { x: number; y: number; r: number }[];
  /** Gems set on the rim (diamond shapes), with their colour. */
  gems: { x: number; y: number; halfWidth: number; halfHeight: number; color: string }[];
  /** Twinkling glints around the medal. */
  sparkles: { x: number; y: number; size: number }[];
  /** Sunburst behind the medal: its polygons (one per ray), in medal coordinates. */
  rays: { x: number; y: number }[][];
}

/** Medal disc of the SVGs (viewBox `0 -2 64 64`): centre, face and outer rim radius. */
const SVG = { cx: 32, cy: 30, face: 19.5, outer: 24 } as const;

/**
 * SVG point to medal coordinates. Radii are mapped piecewise so that each part lands on its 3D
 * counterpart: face disc → face, ring → rim, outside → outside at the same scale.
 */
export function svgToMedal(sx: number, sy: number): { x: number; y: number } {
  const dx = sx - SVG.cx;
  const dy = SVG.cy - sy;
  const s = Math.hypot(dx, dy);
  if (s === 0) return { x: 0, y: 0 };
  const r =
    s <= SVG.face
      ? (s / SVG.face) * FACE_RADIUS
      : s <= SVG.outer
        ? FACE_RADIUS + ((s - SVG.face) / (SVG.outer - SVG.face)) * (1 - FACE_RADIUS)
        : 1 + (s - SVG.outer) / SVG.outer;
  return { x: (dx / s) * r, y: (dy / s) * r };
}

/** SVG length to medal units (at the scale of the outer rim). */
const svgLength = (length: number) => length / SVG.outer;

const num = (el: Element, name: string) => Number(el.getAttribute(name) ?? 0);

/** Bounding box of a path made of absolute coordinates (M/L/Z, as the medal SVGs use). */
function pathBox(d: string): { x0: number; y0: number; x1: number; y1: number } | null {
  if (/[a-yA-Y]/.test(d.replace(/[MLZz]/g, ''))) return null;
  const values = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  if (values.length < 4) return null;
  const xs = values.filter((_, i) => i % 2 === 0);
  const ys = values.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Rotation of `rotate(a cx cy)` in a transform, in degrees. */
function rotation(el: Element): number {
  return Number(/rotate\(\s*(-?[\d.]+)/.exec(el.getAttribute('transform') ?? '')?.[1] ?? 0);
}

/** Polygons of an absolute M/L/Z path, in medal coordinates. */
function pathPolygons(d: string): { x: number; y: number }[][] {
  return d
    .split(/[Mm]/)
    .map((sub) => (sub.match(/-?\d*\.?\d+/g) ?? []).map(Number))
    .filter((values) => values.length >= 6)
    .map((values) =>
      Array.from({ length: values.length / 2 }, (_, i) => svgToMedal(values[2 * i], values[2 * i + 1])),
    );
}

export function parseMedalDecorations(svgText: string): MedalDecorations {
  const decorations: MedalDecorations = { leaves: [], studs: [], gems: [], sparkles: [], rays: [] };
  const root = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  if (root.nodeName !== 'svg') return decorations;
  const children = Array.from(root.children);
  const distance = (x: number, y: number) => Math.hypot(x - SVG.cx, y - SVG.cy);

  // Laurel: a root group made only of ellipses.
  for (const group of children.filter((el) => el.nodeName === 'g')) {
    const ellipses = Array.from(group.children);
    if (!ellipses.length || ellipses.some((el) => el.nodeName !== 'ellipse')) continue;
    for (const el of ellipses) {
      const p = svgToMedal(num(el, 'cx'), num(el, 'cy'));
      decorations.leaves.push({
        ...p,
        rx: svgLength(num(el, 'rx')),
        ry: svgLength(num(el, 'ry')),
        // SVG rotates clockwise with y down: the same turn is counter-clockwise here.
        angle: (-rotation(el) * Math.PI) / 180,
      });
    }
  }

  // Studs: small circles on the ring.
  for (const el of children.filter((c) => c.nodeName === 'circle')) {
    const [cx, cy, r] = [num(el, 'cx'), num(el, 'cy'), num(el, 'r')];
    const d = distance(cx, cy);
    if (r <= 1.5 && d > SVG.face && d < SVG.outer) {
      decorations.studs.push({ ...svgToMedal(cx, cy), r: svgLength(r) });
    }
  }

  const gemBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const el of children.filter((c) => c.nodeName === 'path')) {
    const d = el.getAttribute('d') ?? '';
    const fill = el.getAttribute('fill') ?? '';
    // Sunburst: the path painted with a gradient behind everything.
    if (fill.startsWith('url(')) {
      if (!decorations.rays.length && pathBox(d)) decorations.rays = pathPolygons(d);
      continue;
    }
    const box = pathBox(d);
    if (!box) continue;
    const [cx, cy] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    const inside = (b: (typeof gemBoxes)[number]) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
    if (el.hasAttribute('stroke')) {
      // Gem: an outlined solid shape on the rim (its facet highlights follow, unstroked).
      gemBoxes.push(box);
      decorations.gems.push({
        ...svgToMedal(cx, cy),
        halfWidth: svgLength((box.x1 - box.x0) / 2),
        halfHeight: svgLength((box.y1 - box.y0) / 2),
        color: fill,
      });
    } else if (!gemBoxes.some(inside) && distance(cx, cy) > SVG.face) {
      // Glint: an unstroked star outside the face.
      decorations.sparkles.push({
        ...svgToMedal(cx, cy),
        size: svgLength(Math.max(box.x1 - box.x0, box.y1 - box.y0)),
      });
    }
  }
  return decorations;
}
