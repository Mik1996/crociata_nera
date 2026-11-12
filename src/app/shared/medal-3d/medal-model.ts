import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoColorSpace,
  OctahedronGeometry,
  PMREMGenerator,
  RGBAFormat,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cssColor, cssColorAlpha } from '../styles/css-color';
import { paletteColor } from '../styles/palette-color-3d';
import { MedalDecorations } from './medal-decorations';
import { MedalFinishSpec } from './medal-finish';
import { createBodyGeometry, createFaceGeometry, frontHeightAt } from './medal-geometry';
import { MedalReliefMaps } from './medal-relief';

/** Height of the icon extrusion, in medal units (radius 1). */
const RELIEF_HEIGHT = 0.035;
const LEAF_THICKNESS = 0.05;
/** Gems sit on top of the rim, in front of it and pushed outwards, so they are seen whole. */
const GEM_DEPTH = 0.15;
const GEM_LIFT = 0.1;
const GEM_SCALE = 1.2;
const GEM_OUTSET = 0.4;
/** Palette token of the sunburst and the glints, as in the flat medals. */
const GLINT_COLOR = '--cn-medal-glint';
const LOCKED_GEM = '--cn-medal-locked-gem';

/** Studio renderer settings shared by the interactive scene and the snapshots. */
export function configureRenderer(renderer: WebGLRenderer): void {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(paletteColor('--cn-shadow'), 0);
}

/**
 * Everything of a medal except camera and render loop: lights, reflections, body, face with the
 * relief, decorations. Used by the interactive {@link MedalScene} and by the static snapshots.
 */
export class MedalModel {
  readonly scene = new Scene();
  private readonly environment: Texture;
  private readonly medal = new Group();
  private readonly decorations = new Group();

  private readonly bodyMaterial = new MeshPhysicalMaterial();
  private readonly faceMaterial = new MeshPhysicalMaterial();
  private reliefTextures: DataTexture[] = [];
  private gemMaterials: { material: MeshPhysicalMaterial; color: string }[] = [];
  private rays: Mesh | null = null;
  private sparkles: { sprite: Sprite; phase: number; size: number }[] = [];
  /** Glows (rays, glints) belong to earned medals only. */
  private locked = false;

  constructor(private readonly renderer: WebGLRenderer) {
    // Reflections: a procedural studio room, prefiltered for every roughness (no HDRI to download).
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment;

    // Lights fixed in the world: turning the medal makes the specular highlights slide on the metal.
    const key = new DirectionalLight(paletteColor('--cn-light'), 1.9);
    key.position.set(3, 4, 5);
    const fill = new DirectionalLight(paletteColor('--cn-3d-light-warm'), 0.8);
    fill.position.set(-4, 1, 3);
    const rim = new DirectionalLight(paletteColor('--cn-3d-light-cool'), 0.9);
    rim.position.set(-2, -3, -4);
    this.scene.add(new AmbientLight(paletteColor('--cn-light'), 0.25), key, fill, rim);

    this.medal.add(
      new Mesh(createBodyGeometry(), this.bodyMaterial),
      new Mesh(createFaceGeometry(), this.faceMaterial),
      this.decorations,
    );
    this.scene.add(this.medal);
  }

  /** Metal of the whole medal (body, face, leaves, studs); a locked medal also loses its glows. */
  setFinish(finish: Required<MedalFinishSpec>, locked: boolean): void {
    for (const material of [this.bodyMaterial, this.faceMaterial]) {
      material.color = new Color(finish.color || undefined);
      material.metalness = finish.metalness;
      material.roughness = finish.roughness;
      material.clearcoat = finish.clearcoat;
      material.clearcoatRoughness = finish.clearcoatRoughness;
      material.envMapIntensity = finish.envMapIntensity;
    }
    this.locked = locked;
    this.applyLock();
  }

  /** Decoration relief on the face; `null` removes it. */
  setRelief(maps: MedalReliefMaps | null): void {
    this.disposeRelief();
    const material = this.faceMaterial;
    if (!maps) {
      material.map = material.normalMap = material.roughnessMap = material.displacementMap = null;
    } else {
      const [tone, normal, roughness, displacement] = [
        maps.tone,
        maps.normal,
        maps.roughness,
        maps.displacement,
      ].map((data) => this.dataTexture(data, maps.size));
      this.reliefTextures = [tone, normal, roughness, displacement];
      // Darker decoration: the tone multiplies the metal colour.
      material.map = tone;
      material.normalMap = normal;
      material.normalScale = new Vector2(1, 1);
      material.roughnessMap = roughness;
      // Real extrusion: the decoration stands out of the face when seen from the side.
      material.displacementMap = displacement;
      material.displacementScale = RELIEF_HEIGHT;
    }
    // New maps change the shader program.
    material.needsUpdate = true;
  }

  /**
   * Laurel, studs, gems, rays and glints read from the flat medal; `null` removes them.
   * Returns how far the medal reaches from its centre (1 = the rim), for the framing.
   */
  setDecorations(decorations: MedalDecorations | null): number {
    this.disposeDecorations();
    if (!decorations) return 1;
    const extent = this.buildDecorations(decorations);
    this.applyLock();
    return extent;
  }

  /** Animations of the decorations at a time (ms): the rays turn, the glints twinkle. */
  animate(time: number, dt: number): void {
    if (this.rays) this.rays.rotation.z += dt * 0.12;
    for (const { sprite, phase, size } of this.sparkles) {
      const twinkle = 0.5 + 0.5 * Math.sin(time / 420 + phase);
      sprite.material.opacity = 0.25 + 0.75 * twinkle;
      sprite.scale.setScalar(size * (0.75 + 0.5 * twinkle));
    }
  }

  dispose(): void {
    this.disposeDecorations();
    this.medal.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    this.bodyMaterial.dispose();
    this.faceMaterial.dispose();
    this.disposeRelief();
    this.environment.dispose();
    this.scene.clear();
  }

  /** Builds the decorations; returns how far they reach from the centre. */
  private buildDecorations(decorations: MedalDecorations): number {
    let extent = 1;

    // Laurel: flattened ellipsoids in the middle plane, sticking out of the rim on both sides.
    const leaf = new SphereGeometry(1, 32, 16);
    for (const l of decorations.leaves) {
      const mesh = new Mesh(leaf, this.bodyMaterial);
      mesh.position.set(l.x, l.y, 0);
      mesh.scale.set(l.rx, l.ry, LEAF_THICKNESS);
      mesh.rotation.z = l.angle;
      this.decorations.add(mesh);
      extent = Math.max(extent, Math.hypot(l.x, l.y) + l.rx);
    }

    // Studs: little domes sitting on the front of the rim.
    const stud = new SphereGeometry(1, 20, 10);
    for (const s of decorations.studs) {
      const mesh = new Mesh(stud, this.bodyMaterial);
      mesh.position.set(s.x, s.y, frontHeightAt(Math.hypot(s.x, s.y)));
      mesh.scale.setScalar(s.r);
      this.decorations.add(mesh);
    }

    // Gems: faceted diamonds set on top of the rim, in front of it.
    const gem = new OctahedronGeometry(1, 0);
    for (const g of decorations.gems) {
      const material = new MeshPhysicalMaterial({
        flatShading: true,
        metalness: 0,
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        ior: 1.7,
        envMapIntensity: 0.55,
      });
      this.gemMaterials.push({ material, color: g.color });
      const [halfWidth, halfHeight] = [g.halfWidth * GEM_SCALE, g.halfHeight * GEM_SCALE];
      const distance = Math.hypot(g.x, g.y) || 1;
      const outset = 1 + (halfHeight * GEM_OUTSET) / distance;
      const mesh = new Mesh(gem, material);
      mesh.position.set(g.x * outset, g.y * outset, GEM_LIFT);
      mesh.scale.set(halfWidth, halfHeight, GEM_DEPTH);
      // Point the gem along its radius (the top one stays upright).
      mesh.rotation.z = Math.atan2(g.y, g.x) - Math.PI / 2;
      this.decorations.add(mesh);
      extent = Math.max(extent, distance * outset + halfHeight);
    }

    // Sunburst: a flat glow behind the medal, slowly turning.
    if (decorations.rays.length) {
      const shapes = decorations.rays.map(
        (points) => new Shape(points.map((p) => new Vector2(p.x, p.y))),
      );
      const geometry = new ShapeGeometry(shapes);
      const reach = Math.max(...decorations.rays.flat().map((p) => Math.hypot(p.x, p.y)));
      const position = geometry.getAttribute('position');
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < position.count; i++) {
        uv.setXY(i, 0.5 + position.getX(i) / (2 * reach), 0.5 + position.getY(i) / (2 * reach));
      }
      this.rays = new Mesh(
        geometry,
        new MeshBasicMaterial({
          map: glowTexture(),
          color: paletteColor(GLINT_COLOR),
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      this.decorations.add(this.rays);
      extent = Math.max(extent, reach * 0.9);
    }

    // Glints: twinkling four-point stars, always facing the camera.
    if (decorations.sparkles.length) {
      const texture = sparkleTexture();
      decorations.sparkles.forEach((s, i) => {
        const sprite = new Sprite(
          new SpriteMaterial({
            map: texture,
            color: paletteColor(GLINT_COLOR),
            transparent: true,
            depthWrite: false,
          }),
        );
        sprite.position.set(s.x, s.y, 0.05);
        sprite.scale.setScalar(s.size * 1.8);
        this.sparkles.push({ sprite, phase: i * 2.1, size: s.size * 1.8 });
        this.decorations.add(sprite);
        extent = Math.max(extent, Math.hypot(s.x, s.y) + s.size);
      });
    }
    return extent;
  }

  /** Locked: grey gems, no glows. */
  private applyLock(): void {
    for (const { material, color } of this.gemMaterials) {
      material.color = this.locked ? paletteColor(LOCKED_GEM) : new Color(color);
      const emissive = this.locked ? paletteColor('--cn-shadow') : new Color(color);
      material.emissive = emissive.multiplyScalar(0.35);
      material.roughness = this.locked ? 0.7 : 0.05;
      material.clearcoat = this.locked ? 0 : 1;
    }
    if (this.rays) this.rays.visible = !this.locked;
    for (const { sprite } of this.sparkles) sprite.visible = !this.locked;
  }

  private dataTexture(data: Uint8Array, size: number): DataTexture {
    const texture = new DataTexture(data, size, size, RGBAFormat);
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    return texture;
  }

  private disposeRelief(): void {
    for (const texture of this.reliefTextures) texture.dispose();
    this.reliefTextures = [];
  }

  private disposeDecorations(): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    this.decorations.traverse((object) => {
      if (object instanceof Mesh || object instanceof Sprite) {
        // Sprites share one geometry owned by Three.js: only the meshes' are ours.
        if (object instanceof Mesh) geometries.add(object.geometry);
        const material = object.material as Material & { map?: Texture | null };
        // The medal metal is owned by the model, not by the decorations.
        if (material !== this.bodyMaterial) materials.add(material);
        if (material.map) textures.add(material.map);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.decorations.clear();
    this.gemMaterials = [];
    this.rays = null;
    this.sparkles = [];
  }
}

/** Radial glow of the sunburst, like the gradient of the flat medals (bright inside, fading out). */
function glowTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.4, cssColorAlpha('--cn-medal-glow-core', 1));
  gradient.addColorStop(0.8, cssColorAlpha('--cn-medal-glow-mid', 0.75));
  gradient.addColorStop(1, cssColorAlpha('--cn-medal-glow-edge', 0.1));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Four-point star with a soft halo. */
function sparkleTexture(): CanvasTexture {
  const size = 128;
  const c = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
  halo.addColorStop(0, cssColorAlpha('--cn-light', 0.55));
  halo.addColorStop(0.35, cssColorAlpha('--cn-medal-sparkle-halo', 0.15));
  halo.addColorStop(1, cssColorAlpha('--cn-medal-sparkle-halo', 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = cssColor('--cn-light');
  ctx.beginPath();
  const [long, short] = [c * 0.95, c * 0.16];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? long : short;
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    ctx.lineTo(c + r * Math.cos(a), c + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
