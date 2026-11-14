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
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ScrollyAct } from '../scrolly/scrolly-act';
import { AltarScene } from './altar-scene';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 3D altar with a trophy picture floating above it ({@link AltarScene}). Inside a scrollytelling
 * act the camera orbits around it with the act's progress.
 *
 * Imports Three.js: render it in a `@defer` block so the library stays out of the main bundle.
 * Decorative: the parent keeps an accessible picture of the trophy (also the fallback without
 * WebGL), told by `ready` whether the 3D scene is on screen.
 */
@Component({
  selector: 'crn-altar-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './altar-3d.html',
  styleUrl: './altar-3d.scss',
  host: { 'aria-hidden': 'true', '[class.altar-3d--ready]': 'drawn()' },
})
export class Altar3d {
  /** Trophy picture (shown untouched). */
  readonly imageUrl = input.required<string>();
  /** True once the trophy is drawn, false when WebGL or the picture is not available. */
  readonly ready = output<boolean>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly act = inject(ScrollyAct, { optional: true });
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly scene = signal<AltarScene | null>(null);
  protected readonly drawn = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const motion = this.window?.matchMedia?.(REDUCED_MOTION_QUERY);
      let scene: AltarScene;
      try {
        scene = new AltarScene(canvas, { animate: !motion?.matches });
      } catch {
        this.ready.emit(false);
        return;
      }
      scene.resize(canvas.clientWidth, canvas.clientHeight);

      const onMotion = (event: MediaQueryListEvent) => scene.setAnimate(!event.matches);
      motion?.addEventListener?.('change', onMotion);
      const resize =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
      resize?.observe(canvas);
      // Animated only while on screen.
      const visibility =
        typeof IntersectionObserver === 'undefined'
          ? null
          : new IntersectionObserver(([entry]) => scene.setVisible(entry.isIntersecting));
      visibility?.observe(canvas);
      if (!visibility) scene.setVisible(true);
      const stopOrbit = this.act?.onFrame((metrics) => scene.setOrbit(metrics.progress));

      this.scene.set(scene);
      destroyRef.onDestroy(() => {
        motion?.removeEventListener?.('change', onMotion);
        resize?.disconnect();
        visibility?.disconnect();
        stopOrbit?.();
        scene.dispose();
      });
    });

    // Trophy picture: loaded again when it changes; a stale result is dropped.
    effect((onCleanup) => {
      const scene = this.scene();
      const url = this.imageUrl();
      if (!scene) return;
      let current = true;
      onCleanup(() => (current = false));
      scene.setImage(url).then(
        () => {
          if (!current) return;
          this.drawn.set(true);
          this.ready.emit(true);
        },
        () => current && this.ready.emit(false),
      );
    });
  }
}
