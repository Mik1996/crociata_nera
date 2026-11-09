import { createFaceGeometry, FACE_RADIUS, frontHeightAt, halfProfile, medalProfiles } from './medal-geometry';

describe('medal geometry', () => {
  it('goes from the back centre to the face border, then the face up to the front centre', () => {
    const { body, face } = medalProfiles();
    expect(body[0].x).toBe(0);
    // Concave back (meniscus): its centre is closer to the front than its border.
    const backBorder = body.find((p) => p.x === FACE_RADIUS)!;
    expect(backBorder.y).toBeLessThan(0);
    expect(body[0].y).toBeGreaterThan(backBorder.y);
    // Still a solid medal: the back centre stays behind the face centre.
    expect(body[0].y).toBeLessThan(face.at(-1)!.y - 0.1);
    expect(body.at(-1)!.x).toBe(FACE_RADIUS);
    // Face and body meet without a gap.
    expect(face[0].equals(body.at(-1)!)).toBe(true);
    expect(face.at(-1)!.x).toBe(0);
    expect(face.at(-1)!.y).toBeGreaterThan(0);
  });

  it('has a convex face rising above the rim', () => {
    const front = halfProfile(0.11);
    const rimTop = Math.max(...front.filter((p) => p.x > FACE_RADIUS).map((p) => p.y));
    const { face } = medalProfiles();
    expect(face.at(-1)!.y).toBeGreaterThan(rimTop);
    // Always rising towards the centre: no dent.
    for (let i = 1; i < face.length; i++) expect(face[i].y).toBeGreaterThanOrEqual(face[i - 1].y);
  });

  it('maps the face to planar UVs centred on the medal, facing +Z', () => {
    const geometry = createFaceGeometry();
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      expect(position.getZ(i)).toBeGreaterThan(0);
      expect(uv.getX(i)).toBeCloseTo(0.5 + position.getX(i) / (2 * FACE_RADIUS));
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6);
    }
    geometry.dispose();
  });

  it('keeps the rim thin and tells its height for the studs', () => {
    expect(1 - FACE_RADIUS).toBeLessThan(0.17);
    expect(frontHeightAt(1)).toBeCloseTo(0);
    expect(frontHeightAt(0.9)).toBeCloseTo(0.1);
    expect(frontHeightAt(0.95)).toBeGreaterThan(0);
    expect(frontHeightAt(0.95)).toBeLessThan(0.1);
  });
});
