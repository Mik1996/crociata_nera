import { PerspectiveCamera, WebGLRenderer } from 'three';
import { parseMedalDecorations } from './medal-decorations';
import { MedalFinishSpec } from './medal-finish';
import { configureRenderer, MedalModel } from './medal-model';
import { createReliefMaps } from './medal-relief';
import { framingDistance, MEDAL_FOV } from './medal-scene';

/**
 * Still images of 3D medals, all drawn by one shared off-screen renderer: a page with many medals
 * would otherwise need a WebGL context each, and browsers keep only a handful alive.
 * Loaded on demand by `MedalSnapshots`; calls must not overlap (the service queues them).
 */

export interface MedalSnapshotRequest {
  /** Text of the flat medal SVG. */
  svg: string;
  finish: Required<MedalFinishSpec>;
  locked: boolean;
  /** Side of the image, in device pixels. */
  size: number;
  /** Same framing for every medal (radius reached, 1 = rim), so they line up in a grid. */
  extent: number;
}

/** The context is released when no snapshot is asked for this long. */
const IDLE_DISPOSE_MS = 15_000;
/** Relief resolution: thumbnails do not need the dialog's 1024 px. */
const RELIEF_SIZE = 512;

let shared: { renderer: WebGLRenderer; model: MedalModel; camera: PerspectiveCamera } | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function studio() {
  if (!shared) {
    const renderer = new WebGLRenderer({
      canvas: document.createElement('canvas'),
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    configureRenderer(renderer);
    shared = {
      renderer,
      model: new MedalModel(renderer),
      camera: new PerspectiveCamera(MEDAL_FOV, 1, 0.1, 50),
    };
  }
  return shared;
}

/** Frees the shared renderer now (also done by itself when idle). */
export function disposeMedalSnapshots(): void {
  clearTimeout(idleTimer);
  if (!shared) return;
  shared.model.dispose();
  shared.renderer.dispose();
  shared.renderer.forceContextLoss();
  shared = null;
}

/** Draws a medal from the front, at rest, and returns it as a PNG. Throws without WebGL. */
export async function renderMedalSnapshot(request: MedalSnapshotRequest): Promise<Blob> {
  clearTimeout(idleTimer);
  try {
    const maps = await createReliefMaps(request.svg, RELIEF_SIZE).catch(() => null);
    const { renderer, model, camera } = studio();
    renderer.setSize(request.size, request.size, false);
    model.setFinish(request.finish, request.locked);
    model.setDecorations(parseMedalDecorations(request.svg));
    model.setRelief(maps);
    // Glints half lit, rays at rest.
    model.animate(0, 0);
    camera.position.set(0, 0, framingDistance(request.extent));
    camera.lookAt(0, 0, 0);
    renderer.render(model.scene, camera);
    return await new Promise<Blob>((resolve, reject) =>
      renderer.domElement.toBlob((blob) =>
        blob ? resolve(blob) : reject(new Error('Snapshot failed')),
      ),
    );
  } finally {
    idleTimer = setTimeout(disposeMedalSnapshots, IDLE_DISPOSE_MS);
  }
}
