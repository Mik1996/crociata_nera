import {
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActMetrics, ActState, staticMetrics, toRoman } from './scrolly-math';
import { ScrollyRoot } from './scrolly-root';

type FrameListener = (metrics: ActMetrics) => void;

/**
 * One act of a scrollytelling page (inside an {@link ScrollyRoot}). Usually a host directive of
 * the act's component, configured from the page template:
 *
 * ```html
 * <app-act-war actId="war" [actLabel]="'…' | translate" [actLength]="2.5" />
 * ```
 *
 * `actLength` > 0 makes it a pinned act, as tall as that many scrollports: its `.scrolly-stage`
 * stays on screen while the progress runs from 0 to 1. With 0 the act keeps its natural height.
 *
 * Every frame it writes on its host (only when they change):
 * - `--p` progress, `--enter`, `--exit`, `--t` whole journey: 0–1 (see {@link ActMetrics});
 * - `--top`, `--h`: position and height in px, for effects tied to the scrollport line.
 *
 * Canvas and 3D effects subscribe with {@link onFrame}; templates read `state()`, `near()`, `seen()`.
 */
@Directive({
  selector: '[appScrollyAct]',
  exportAs: 'scrollyAct',
  host: {
    class: 'scrolly-act',
    tabindex: '-1',
    '[attr.id]': 'actId()',
    '[attr.data-act-state]': 'state()',
    '[class.scrolly-act--pinned]': 'actLength() > 0',
    '[class.scrolly-act--static]': 'isStatic()',
    '[style.--act-length]': 'actLength() || null',
  },
})
export class ScrollyAct {
  /** Element id: target of the index and of in-page links. */
  readonly actId = input.required<string>();
  /** Name in the index; acts without a label stay out of it (and are not numbered). */
  readonly actLabel = input('');
  /** Scrollports of scrolling while pinned; 0 = natural height, not pinned. */
  readonly actLength = input(0);

  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly root = inject(ScrollyRoot, { optional: true });

  readonly state = signal<ActState>('before');
  /** Within one scrollport from being visible. */
  readonly near = signal(false);
  /** Has been near at least once: heavy content, once loaded, stays. */
  readonly seen = signal(false);
  readonly isStatic = signal(!this.root);

  /**
   * Roman number among the labelled acts, counting from 0: the first one (the prologue) has none.
   */
  readonly numeral = computed(() => {
    const labelled = (this.root?.acts() ?? []).filter((act) => act.actLabel());
    return toRoman(labelled.indexOf(this));
  });

  private metrics: ActMetrics | null = null;
  private readonly listeners = new Set<FrameListener>();
  private readonly written = new Map<string, string>();

  constructor() {
    if (this.root) {
      const unregister = this.root.register(this);
      inject(DestroyRef).onDestroy(unregister);
    } else {
      // Outside a scrollytelling page: always in its final state.
      queueMicrotask(() => this.update(staticMetrics(), true));
    }
  }

  /** Last metrics (null before the first frame). */
  get current(): ActMetrics | null {
    return this.metrics;
  }

  /** Called on every frame with the act's metrics (at once with the last ones, if any). */
  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    if (this.metrics) listener(this.metrics);
    return () => this.listeners.delete(listener);
  }

  /**
   * Engine only: new measures for this frame. Static page, or a pinned act shown unpinned: the
   * effects get the final state, while `state`/`near` keep following the real position.
   */
  update(measured: ActMetrics, isStatic: boolean): void {
    const frozen = isStatic || this.unpinned;
    const metrics = frozen ? staticMetrics(measured.height) : measured;
    this.metrics = metrics;
    this.isStatic.set(frozen);
    this.state.set(measured.state);
    this.near.set(measured.near);
    if (measured.near) this.seen.set(true);

    this.write('--p', metrics.progress.toFixed(4));
    this.write('--enter', metrics.enter.toFixed(4));
    this.write('--exit', metrics.exit.toFixed(4));
    this.write('--t', metrics.span.toFixed(4));
    this.write('--top', `${Math.round(metrics.top)}px`);
    this.write('--h', `${Math.round(metrics.height)}px`);

    for (const listener of this.listeners) listener(metrics);
  }

  /**
   * Engine only, after a resize: a pinned act whose stage content (`[data-scrolly-fit]`) is taller
   * than the scrollport cannot stay pinned without hiding part of it, so it becomes a plain section.
   */
  checkFit(viewport: number): void {
    const content = this.actLength() > 0 ? this.element.querySelector<HTMLElement>('[data-scrolly-fit]') : null;
    if (!content || viewport <= 0) {
      this.setUnpinned(false);
      return;
    }
    // Measured in the pinned layout: an unpinned act is also frozen (`scrolly-act--static`, bound
    // to `isStatic`), and both classes switch the content to its plain layout, usually taller.
    // Otherwise an act unpinned once (phone in landscape) would never fit again (in portrait).
    const classes = this.element.classList;
    const frozen = classes.contains('scrolly-act--static');
    classes.remove('scrolly-act--unpinned', 'scrolly-act--static');
    const unpinned = content.scrollHeight > viewport + 1;
    // Back as the binding left it: `update()` changes it through `isStatic`.
    if (frozen) classes.add('scrolly-act--static');
    this.setUnpinned(unpinned);
  }

  private unpinned = false;

  private setUnpinned(unpinned: boolean): void {
    this.unpinned = unpinned;
    this.element.classList.toggle('scrolly-act--unpinned', unpinned);
  }

  private write(name: string, value: string): void {
    if (this.written.get(name) === value) return;
    this.written.set(name, value);
    this.element.style.setProperty(name, value);
  }
}
