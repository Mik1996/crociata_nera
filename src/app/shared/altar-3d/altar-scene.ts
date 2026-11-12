import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cssColorAlpha } from '../styles/css-color';
import { paletteColor } from '../styles/palette-color-3d';

export interface AltarSceneOptions {
  /** Continuous animation (floating trophy, embers, rays); off = drawn only when something changes. */
  animate: boolean;
}

const FOV = 30;
/**
 * Centre and radius of the sphere that holds altar, trophy and the rays behind it: the camera
 * always frames it, so the light is never cut by the edges of the canvas.
 */
const FRAME_CENTER = new Vector3(0, 1.95, 0);
const FRAME_RADIUS = 2.05;
/** Orbit of the camera over the progress: from the left to the right of the altar (radians). */
const ORBIT_FROM = -0.62;
const ORBIT_TO = 0.62;
/** Height of the camera above the frame centre, in degrees, at the start and end of the orbit. */
const ELEVATION_FROM = 16;
const ELEVATION_TO = 6;
/** Top of the altar, where the trophy floats. */
const ALTAR_TOP = 1.69;
const TROPHY_HEIGHT = 1.55;
const TROPHY_CENTER = ALTAR_TOP + 0.2 + TROPHY_HEIGHT / 2;
const EMBERS = 70;
/** Side of the square of the rays behind the trophy (they fade out before its edges). */
const RAYS_SIZE = 3.2;

/** Octagonal prisms are rotated so that a face, not an edge, looks at the camera. */
const FACE_FORWARD = -Math.PI / 8;

/**
 * 3D altar of the Clan War League: a stone and gold pedestal of our own, lit by torches, with the
 * league trophy floating above it.
 *
 * Supercell Fan Content Policy: the trophy is the official picture, untouched. It is drawn on a
 * flat, unlit plane (exact colours, proportions and outline: no light, tone mapping or effect is
 * applied to it, nothing is drawn over it) that always faces the camera. Lights, reflections and
 * particles only touch our own geometry.
 */
export class AltarScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  private readonly environment: Texture;
  private readonly textures: Texture[] = [];
  private readonly trophy = new Group();
  private readonly rays: Mesh;
  private readonly embers: Points;
  private readonly emberSpeed: Float32Array;
  private icon: Mesh | null = null;

  private orbit = 0.5;
  private animate: boolean;
  private visible = false;
  private frame = 0;
  private last = 0;
  private time = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: AltarSceneOptions) {
    this.animate = options.animate;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(paletteColor('--cn-shadow'), 0);

    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.45;

    this.addLights();
    this.scene.add(this.buildGround(), this.buildAltar());

    this.rays = this.buildRays();
    this.trophy.add(this.rays);
    this.trophy.position.y = TROPHY_CENTER;
    this.scene.add(this.trophy);

    const { points, speed } = this.buildEmbers();
    this.embers = points;
    this.emberSpeed = speed;
    this.scene.add(this.embers);

    this.placeCamera();
  }

  /** Loads the trophy picture; resolves once it is on the altar. */
  async setImage(url: string): Promise<void> {
    const texture = await new TextureLoader().loadAsync(url);
    if (this.disposed) {
      texture.dispose();
      return;
    }
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.textures.push(texture);

    const image = texture.image as { width: number; height: number };
    const aspect = image.width && image.height ? image.width / image.height : 1;
    if (this.icon) {
      this.trophy.remove(this.icon);
      this.disposeMesh(this.icon);
    }
    this.icon = new Mesh(
      new PlaneGeometry(TROPHY_HEIGHT * aspect, TROPHY_HEIGHT),
      // Unlit and not tone-mapped: the picture keeps its exact colours.
      new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }),
    );
    // Drawn last: no particle or glow ever covers it.
    this.icon.renderOrder = 10;
    this.trophy.add(this.icon);
    this.requestRender();
  }

  /** Camera position along the orbit, 0–1 (the act's progress). */
  setOrbit(orbit: number): void {
    if (Math.abs(orbit - this.orbit) < 1e-4) return;
    this.orbit = orbit;
    this.placeCamera();
    this.requestRender();
  }

  /** On screen or not: the animation runs only while visible. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.requestRender();
  }

  setAnimate(animate: boolean): void {
    this.animate = animate;
    this.requestRender();
  }

  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.placeCamera();
    this.requestRender();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.scene.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points) this.disposeMesh(object);
    });
    this.textures.forEach((texture) => texture.dispose());
    this.environment.dispose();
    this.renderer.dispose();
  }

  // --- Rendering -------------------------------------------------------------------------------

  private requestRender(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    this.frame = 0;
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    const running = this.animate && this.visible;
    if (running) this.step(dt);
    this.faceCamera();
    this.renderer.render(this.scene, this.camera);
    if (running) this.requestRender();
    else this.last = 0;
  }

  /** Floating trophy, turning rays, rising embers. */
  private step(dt: number): void {
    this.time += dt;
    this.trophy.position.y = TROPHY_CENTER + Math.sin(this.time * 1.3) * 0.045;
    const rays = (this.rays.material as MeshBasicMaterial).map!;
    rays.rotation += dt * 0.12;

    const positions = this.embers.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < EMBERS; i++) {
      let y = positions.getY(i) + this.emberSpeed[i] * dt;
      if (y > 3.6) y = 0.2;
      positions.setY(i, y);
      positions.setX(i, positions.getX(i) + Math.sin(this.time * 0.9 + i) * dt * 0.05);
    }
    positions.needsUpdate = true;
  }

  /** The trophy and its rays always face the camera. */
  private faceCamera(): void {
    this.trophy.quaternion.copy(this.camera.quaternion);
  }

  private placeCamera(): void {
    const t = this.orbit;
    const angle = ORBIT_FROM + (ORBIT_TO - ORBIT_FROM) * t;
    const elevation = ((ELEVATION_FROM + (ELEVATION_TO - ELEVATION_FROM) * t) * Math.PI) / 180;
    const vertical = (FOV / 2) * (Math.PI / 180);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = (FRAME_RADIUS / Math.sin(Math.min(vertical, horizontal))) * 1.02;
    this.camera.position.set(
      FRAME_CENTER.x + distance * Math.sin(angle) * Math.cos(elevation),
      FRAME_CENTER.y + distance * Math.sin(elevation),
      FRAME_CENTER.z + distance * Math.cos(angle) * Math.cos(elevation),
    );
    this.camera.lookAt(FRAME_CENTER);
    this.camera.updateProjectionMatrix();
  }

  // --- Building --------------------------------------------------------------------------------

  private addLights(): void {
    this.scene.add(new AmbientLight(paletteColor('--cn-altar-ambient'), 0.7));
    const key = new DirectionalLight(paletteColor('--cn-altar-key-light'), 2.6);
    key.position.set(2.5, 4, 3.5);
    const rim = new DirectionalLight(paletteColor('--cn-altar-rim-light'), 3);
    rim.position.set(-3, 2.5, -3.5);
    const fill = new DirectionalLight(paletteColor('--cn-altar-fill-light'), 0.35);
    fill.position.set(-4, 1.5, 2);
    // The trophy's own glow on the top of the altar.
    const glow = new PointLight(paletteColor('--cn-altar-flame'), 5, 3.2, 2);
    glow.position.set(0, ALTAR_TOP + 0.35, 0.2);
    this.scene.add(key, rim, fill, glow);
  }

  private buildAltar(): Group {
    const stone = new MeshStandardMaterial({ color: paletteColor('--cn-altar-stone'), roughness: 0.82, metalness: 0.08, flatShading: true });
    const darkStone = new MeshStandardMaterial({ color: paletteColor('--cn-altar-stone-dark'), roughness: 0.9, metalness: 0.05, flatShading: true });
    const goldMetal = new MeshPhysicalMaterial({ color: paletteColor('--cn-clan-gold-leaf'), metalness: 1, roughness: 0.3, clearcoat: 0.4 });

    const altar = new Group();
    const prism = (top: number, bottom: number, height: number, y: number, material: Material) => {
      const mesh = new Mesh(new CylinderGeometry(top, bottom, height, 8), material);
      mesh.position.y = y;
      mesh.rotation.y = FACE_FORWARD;
      altar.add(mesh);
    };

    // Steps, column, capital and top, from the ground up, with gold rings.
    prism(1.15, 1.25, 0.22, 0.11, darkStone);
    prism(1.17, 1.17, 0.04, 0.23, goldMetal);
    prism(0.95, 1.0, 0.18, 0.34, stone);
    prism(0.97, 0.97, 0.035, 0.44, goldMetal);
    prism(0.5, 0.62, 1.0, 0.95, stone);
    prism(0.78, 0.55, 0.2, 1.55, stone);
    prism(0.8, 0.8, 0.04, 1.66, goldMetal);
    prism(0.7, 0.75, 0.05, 1.665, darkStone);

    // Gold crosses of the clan on four faces of the column (leaning like the tapered faces).
    const lean = Math.atan(0.12 / 1.0);
    for (let k = 0; k < 4; k++) {
      const face = new Group();
      face.rotation.y = (k * Math.PI) / 2;
      const cross = new Group();
      cross.position.set(0, 0.98, 0.528);
      cross.rotation.x = -lean;
      const upright = new Mesh(new BoxGeometry(0.07, 0.4, 0.03), goldMetal);
      const arm = new Mesh(new BoxGeometry(0.26, 0.07, 0.03), goldMetal);
      arm.position.y = 0.07;
      cross.add(upright, arm);
      face.add(cross);
      altar.add(face);
    }

    // Embers glowing in the top of the altar.
    const brazier = new Mesh(
      new CircleGeometry(0.55, 32),
      new MeshBasicMaterial({
        map: this.glowTexture(
          cssColorAlpha('--cn-altar-ember-glow', 1),
          cssColorAlpha('--cn-altar-ember-edge', 0),
        ),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    brazier.rotation.x = -Math.PI / 2;
    brazier.position.y = ALTAR_TOP + 0.005;
    altar.add(brazier);
    return altar;
  }

  /** Warm light pool on the ground, fading out well inside the frame (never cut by the canvas). */
  private buildGround(): Mesh {
    const ground = new Mesh(
      new CircleGeometry(1.9, 48),
      new MeshBasicMaterial({
        map: this.glowTexture(
          cssColorAlpha('--cn-altar-ground', 0.85),
          cssColorAlpha('--cn-altar-ground-edge', 0),
        ),
        transparent: true,
        depthWrite: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    return ground;
  }

  /** Rays of light behind the trophy. */
  private buildRays(): Mesh {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    ctx.translate(c, c);
    for (let i = 0; i < 18; i++) {
      ctx.rotate((Math.PI * 2) / 18);
      const gradient = ctx.createLinearGradient(0, 0, 0, -c);
      gradient.addColorStop(0, cssColorAlpha('--cn-altar-ember-light', 0.55));
      gradient.addColorStop(1, cssColorAlpha('--cn-altar-flame', 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, -c);
      ctx.lineTo(10, -c);
      ctx.closePath();
      ctx.fill();
    }
    const texture = new CanvasTexture(canvas);
    texture.center.set(0.5, 0.5);
    this.textures.push(texture);
    const mesh = new Mesh(
      new PlaneGeometry(RAYS_SIZE, RAYS_SIZE),
      new MeshBasicMaterial({ map: texture, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.75 }),
    );
    // Just behind the trophy (the group faces the camera).
    mesh.position.z = -0.05;
    mesh.renderOrder = 5;
    return mesh;
  }

  private buildEmbers(): { points: Points; speed: Float32Array } {
    const positions = new Float32Array(EMBERS * 3);
    const speed = new Float32Array(EMBERS);
    for (let i = 0; i < EMBERS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 1.6;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.2 + Math.random() * 3.4;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speed[i] = 0.25 + Math.random() * 0.5;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        size: 0.06,
        map: this.glowTexture(
          cssColorAlpha('--cn-altar-ember-light', 1),
          cssColorAlpha('--cn-altar-ember-edge', 0),
        ),
        color: paletteColor('--cn-altar-ember'),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.renderOrder = 1;
    return { points, speed };
  }

  /** Radial gradient texture (glows, embers, light pools). */
  private glowTexture(inner: string, outer: string): Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.textures.push(texture);
    return texture;
  }

  private disposeMesh(object: Mesh | Points): void {
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  }
}
