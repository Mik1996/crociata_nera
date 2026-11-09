import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MedalFinish, resolveFinish } from './medal-finish';
import { parseMedalDecorations } from './medal-decorations';
import { createReliefMaps } from './medal-relief';
import { MedalScene } from './medal-scene';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Interactive 3D medal (Three.js): convex metal coin with the icon of the flat SVG medal embossed
 * on its face, rotated with mouse or touch and slowly turning by itself when left alone.
 *
 * Imports Three.js: load it lazily (e.g. `await import(...)` before opening a dialog) so the
 * library stays out of the initial bundle. Without WebGL the flat SVG is shown instead.
 *
 * Zoneless-friendly: the render loop draws on the canvas without touching signals, so it never
 * triggers change detection; inputs reach the scene through effects.
 */
@Component({
  selector: 'app-medal-3d-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medal-3d-viewer.html',
  styleUrl: './medal-3d-viewer.scss',
})
export class Medal3dViewer {
  /** Flat medal SVG: its central icon becomes the relief (also the fallback without WebGL). */
  readonly svgUrl = input.required<string>();
  /** Metal of the medal: a built-in tier or any custom finish. */
  readonly finish = input<MedalFinish>('gold');
  /** Not earned yet: dark matte surface, whatever the finish. */
  readonly locked = input(false);
  /** Slow turn while the user is not dragging (off when the user prefers reduced motion). */
  readonly autoRotate = input(true);
  /** Accessible name of the canvas. */
  readonly label = input('');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly window = inject(DOCUMENT).defaultView;
  /** Set once the WebGL scene exists, after the first render. */
  private readonly scene = signal<MedalScene | null>(null);
  protected readonly unsupported = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      let scene: MedalScene;
      try {
        scene = new MedalScene(canvas, { autoRotate: this.shouldAutoRotate() });
      } catch {
        this.unsupported.set(true);
        return;
      }
      scene.resize(canvas.clientWidth, canvas.clientHeight);
      const observer =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(([entry]) =>
              scene.resize(entry.contentRect.width, entry.contentRect.height),
            );
      observer?.observe(canvas);
      this.scene.set(scene);

      destroyRef.onDestroy(() => {
        observer?.disconnect();
        scene.dispose();
      });
    });

    effect(() => this.scene()?.setFinish(resolveFinish(this.finish(), this.locked()), this.locked()));

    effect(() => {
      const autoRotate = this.shouldAutoRotate();
      this.scene()?.setAutoRotate(autoRotate);
    });

    // Relief and decorations from the flat SVG: rebuilt when it changes; a stale result is dropped.
    effect((onCleanup) => {
      const scene = this.scene();
      const url = this.svgUrl();
      if (!scene) return;
      let current = true;
      onCleanup(() => (current = false));
      const svg = fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      });
      // A plain medal is still a medal: relief and decorations are details.
      svg
        .then((text) => current && scene.setDecorations(parseMedalDecorations(text)))
        .catch(() => current && scene.setDecorations(null));
      svg
        .then((text) => createReliefMaps(text))
        .then((maps) => current && scene.setRelief(maps))
        .catch(() => current && scene.setRelief(null));
    });
  }

  private shouldAutoRotate(): boolean {
    return this.autoRotate() && !this.window?.matchMedia?.(REDUCED_MOTION_QUERY).matches;
  }
}
