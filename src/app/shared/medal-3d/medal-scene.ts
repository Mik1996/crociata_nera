import { PerspectiveCamera, Spherical, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MedalDecorations } from './medal-decorations';
import { MedalFinishSpec } from './medal-finish';
import { configureRenderer, MedalModel } from './medal-model';
import { MedalReliefMaps } from './medal-relief';

/** After the user lets go, the medal goes back to its starting pose after this delay. */
const RETURN_DELAY_MS = 1200;
/** Speed of the way back (higher = faster), per second. */
const RETURN_RATE = 3.2;
/** One turn every ~40 s. */
const AUTO_ROTATE_SPEED = 1.5;
export const MEDAL_FOV = 30;

/** Camera distance that frames a medal reaching `extent` from its centre, with a small margin. */
export function framingDistance(extent: number): number {
  return (extent * 1.12) / Math.tan(((MEDAL_FOV / 2) * Math.PI) / 180);
}

/** Half thickness of the medal with gems and studs, in front and behind the middle plane. */
const MEDAL_DEPTH = 0.3;

/**
 * Closest camera distance at which the medal never leaves the canvas, whatever its rotation: the
 * sphere around it (decorations and thickness included) must fit the narrower field of view.
 */
export function closestDistance(extent: number, aspect: number): number {
  const radius = Math.hypot(extent, MEDAL_DEPTH);
  const vertical = ((MEDAL_FOV / 2) * Math.PI) / 180;
  const half = Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
  return (radius / Math.sin(half)) * 1.02;
}

export interface MedalSceneOptions {
  autoRotate: boolean;
}

/**
 * Interactive medal on a canvas: orbit controls, slow auto-rotation, way back to the front when
 * let go. Framework-agnostic: the render loop runs on `requestAnimationFrame` and touches only
 * WebGL, never Angular state. `dispose()` frees every GPU resource and stops the loop.
 */
export class MedalScene {
  private readonly renderer: WebGLRenderer;
  private readonly model: MedalModel;
  private readonly camera = new PerspectiveCamera(MEDAL_FOV, 1, 0.1, 50);
  private readonly controls: OrbitControls;

  private frame = 0;
  private lastTime = 0;
  private returnTimer: ReturnType<typeof setTimeout> | undefined;
  /** Going back to the starting pose, then auto-rotation. */
  private returning = false;
  private interacting = false;
  private autoRotate: boolean;
  /** How far the medal reaches from its centre (1 = rim), decorations included. */
  private extent = 1;
  /** Camera distance that frames the medal with its decorations. */
  private homeDistance = framingDistance(1);
  private readonly spherical = new Spherical();
  private readonly offset = new Vector3();
  private disposed = false;

  /** Throws when WebGL is not available (the caller shows the flat medal instead). */
  constructor(canvas: HTMLCanvasElement, options: MedalSceneOptions) {
    this.autoRotate = options.autoRotate;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    configureRenderer(this.renderer);
    this.model = new MedalModel(this.renderer);

    this.camera.position.set(0, 0, this.homeDistance);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.8;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    this.controls.autoRotate = this.autoRotate;
    this.updateZoomLimits();
    this.controls.addEventListener('start', this.onInteractionStart);
    this.controls.addEventListener('end', this.onInteractionEnd);

    this.loop(performance.now());
  }

  setFinish(finish: Required<MedalFinishSpec>, locked: boolean): void {
    this.model.setFinish(finish, locked);
  }

  setRelief(maps: MedalReliefMaps | null): void {
    this.model.setRelief(maps);
  }

  setDecorations(decorations: MedalDecorations | null): void {
    this.extent = this.model.setDecorations(decorations);
    this.updateZoomLimits();
    // Reframe smoothly, unless the user is holding the medal (it is reframed when let go).
    if (!this.interacting) this.startReturn();
  }

  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
    this.controls.autoRotate = enabled && !this.returning;
  }

  /** Canvas size in CSS pixels. */
  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateZoomLimits();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.returnTimer);
    this.controls.removeEventListener('start', this.onInteractionStart);
    this.controls.removeEventListener('end', this.onInteractionEnd);
    this.controls.dispose();
    this.model.dispose();
    this.renderer.dispose();
    // Browsers keep only a few WebGL contexts: release this one now, not at garbage collection.
    this.renderer.forceContextLoss();
  }

  private readonly loop = (time: number): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (time - (this.lastTime || time)) / 1000);
    this.lastTime = time;

    if (this.returning) this.stepReturn(dt);
    this.model.animate(time, dt);
    this.controls.update();
    this.renderer.render(this.model.scene, this.camera);
  };

  /** Eases the camera back in front of the medal; at the end the slow turn starts again. */
  private stepReturn(dt: number): void {
    const k = 1 - Math.exp(-RETURN_RATE * dt);
    this.offset.copy(this.camera.position).sub(this.controls.target);
    this.spherical.setFromVector3(this.offset);
    this.spherical.theta += (0 - this.spherical.theta) * k;
    this.spherical.phi += (Math.PI / 2 - this.spherical.phi) * k;
    this.spherical.radius += (this.homeDistance - this.spherical.radius) * k;
    const done =
      Math.abs(this.spherical.theta) < 1e-3 &&
      Math.abs(this.spherical.phi - Math.PI / 2) < 1e-3 &&
      Math.abs(this.spherical.radius - this.homeDistance) < 1e-3;
    if (done) {
      this.spherical.set(this.homeDistance, Math.PI / 2, 0);
      this.returning = false;
      this.controls.autoRotate = this.autoRotate;
    }
    this.camera.position.setFromSpherical(this.spherical).add(this.controls.target);
  }

  private startReturn(): void {
    this.returning = true;
    this.controls.autoRotate = false;
  }

  private readonly onInteractionStart = (): void => {
    clearTimeout(this.returnTimer);
    this.interacting = true;
    this.returning = false;
    this.controls.autoRotate = false;
  };

  private readonly onInteractionEnd = (): void => {
    this.interacting = false;
    clearTimeout(this.returnTimer);
    this.returnTimer = setTimeout(() => this.startReturn(), RETURN_DELAY_MS);
  };

  /** Zoom in only as far as the medal stays whole inside the canvas (never cut at the edges). */
  private updateZoomLimits(): void {
    const closest = closestDistance(this.extent, this.camera.aspect);
    this.homeDistance = Math.max(framingDistance(this.extent), closest);
    this.controls.minDistance = closest;
    this.controls.maxDistance = this.homeDistance * 1.6;
  }
}
