import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import type { ScrollyAct } from './scrolly-act';
import { ActMetrics, measureAct } from './scrolly-math';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Window scrolling (short screens): the browser bars come and go while scrolling and resize the
 * viewport. Height changes below this share are ignored, so pinned acts do not jump.
 */
const VIEWPORT_JITTER = 0.25;

/**
 * Engine of a scrollytelling page: one listener and one animation frame for every act inside it.
 *
 * Every frame it measures the acts ({@link ScrollyAct}) against the scrollport (the nearest
 * scrolling ancestor, or the window) and hands them their {@link ActMetrics}. The acts write them
 * as CSS custom properties, so effects are mostly plain CSS and change detection never runs per
 * frame. It also exposes `--scrolly-vh` (the scrollport height, in px), the height of the stages.
 *
 * Static mode (user prefers reduced motion, or no layout as in tests): no measuring, every act
 * gets its final state and the page is a plain column of sections.
 */
@Directive({
  selector: '[appScrollyRoot]',
  exportAs: 'scrollyRoot',
  host: {
    class: 'scrolly',
    '[class.scrolly--static]': 'isStatic()',
  },
})
export class ScrollyRoot {
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly window = inject(DOCUMENT).defaultView;

  /** Acts in page order. */
  readonly acts = signal<readonly ScrollyAct[]>([]);
  /** Id of the labelled act in the middle of the scrollport (for the index). */
  readonly activeId = signal<string | null>(null);
  readonly isStatic = signal(false);

  private readonly registered = new Set<ScrollyAct>();
  private reducedMotion = false;
  /** Scrolling ancestor; `null` when the window scrolls. */
  private port: HTMLElement | null = null;
  private portDirty = true;
  private viewport = 0;
  private viewportWidth = 0;
  private frame = 0;
  private ready = false;
  /** Watches the root and every act: content loaded later changes heights and maybe the scrollport. */
  private resize: ResizeObserver | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const win = this.window;
      if (!win) return;
      const schedule = () => this.schedule();
      const relayout = () => {
        this.portDirty = true;
        this.schedule();
      };

      const motion = win.matchMedia?.(REDUCED_MOTION_QUERY);
      this.reducedMotion = !!motion?.matches;
      const onMotion = (event: MediaQueryListEvent) => {
        this.reducedMotion = event.matches;
        this.schedule();
      };
      motion?.addEventListener?.('change', onMotion);

      // Capture: catches the scroll of any ancestor, whichever one scrolls on this screen.
      win.document.addEventListener('scroll', schedule, { capture: true, passive: true });
      win.addEventListener('resize', relayout, { passive: true });
      this.resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(relayout);
      this.resize?.observe(this.element);
      this.registered.forEach((act) => this.resize?.observe(act.element));

      destroyRef.onDestroy(() => {
        motion?.removeEventListener?.('change', onMotion);
        win.document.removeEventListener('scroll', schedule, { capture: true });
        win.removeEventListener('resize', relayout);
        this.resize?.disconnect();
        cancelAnimationFrame(this.frame);
      });

      this.ready = true;
      this.refresh();
    });
  }

  /** Adds an act; returns the function that removes it. */
  register(act: ScrollyAct): () => void {
    this.registered.add(act);
    this.resize?.observe(act.element);
    this.portDirty = true;
    this.schedule();
    return () => {
      this.registered.delete(act);
      this.resize?.unobserve(act.element);
      this.acts.update((acts) => acts.filter((a) => a !== act));
      this.portDirty = true;
      this.schedule();
    };
  }

  /** Measures again at the next frame. */
  schedule(): void {
    if (!this.ready || this.frame || !this.window) return;
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = 0;
      this.refresh();
    });
  }

  /** Measures every act now and hands it its metrics. */
  refresh(): void {
    const relayout = this.portDirty;
    if (this.portDirty) {
      this.port = this.findScrollport();
      this.portDirty = false;
    }
    const resized = this.updateViewport();

    const acts = this.sortedActs();
    const isStatic = this.reducedMotion || this.viewport === 0;
    this.isStatic.set(isStatic);
    // Pinned acts whose content is taller than the stage are shown unpinned.
    if (relayout || resized) acts.forEach((act) => act.checkFit(isStatic ? 0 : this.viewport));

    // Every read first, then every write: one layout per frame.
    const portTop = this.port ? this.port.getBoundingClientRect().top + this.port.clientTop : 0;
    const measured: ActMetrics[] = acts.map((act) => {
      const rect = act.element.getBoundingClientRect();
      return measureAct(rect.top - portTop, rect.height, this.viewport);
    });
    acts.forEach((act, i) => act.update(measured[i], isStatic));

    // Also in static mode: the index still follows the reader.
    this.activeId.set(this.findActive(acts, measured));
  }

  /** Scrolls to the start of an act and moves the focus there (index, "join" buttons). */
  scrollTo(id: string): void {
    const act = Array.from(this.registered).find((a) => a.actId() === id);
    if (!act) return;
    const smooth = !this.reducedMotion && !this.isStatic();
    act.element.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    act.element.focus({ preventScroll: true });
  }

  /** Nearest ancestor that really scrolls (the element itself included); `null` = the window. */
  private findScrollport(): HTMLElement | null {
    const win = this.window!;
    for (let node: HTMLElement | null = this.element; node; node = node.parentElement) {
      if (node === win.document.body || node === win.document.documentElement) break;
      const overflow = win.getComputedStyle(node).overflowY;
      const scrolls = overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
      if (scrolls && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return null;
  }

  /** Reads the scrollport size; true when it changed. */
  private updateViewport(): boolean {
    const win = this.window!;
    const width = this.port ? this.port.clientWidth : win.innerWidth;
    let height = this.port ? this.port.clientHeight : win.innerHeight;
    // Window scrolling: keep the height while only the browser bars move.
    if (!this.port && this.viewport && width === this.viewportWidth) {
      if (Math.abs(height - this.viewport) < this.viewport * VIEWPORT_JITTER) height = this.viewport;
    }
    const changed = height !== this.viewport || width !== this.viewportWidth;
    if (height !== this.viewport) this.element.style.setProperty('--scrolly-vh', `${height}px`);
    this.viewport = height;
    this.viewportWidth = width;
    return changed;
  }

  /** Registered acts in document order; the signal changes only when the order does. */
  private sortedActs(): ScrollyAct[] {
    const sorted = Array.from(this.registered).sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const current = this.acts();
    if (sorted.length !== current.length || sorted.some((act, i) => act !== current[i])) {
      this.acts.set(sorted);
    }
    return sorted;
  }

  /** Last labelled act whose top has passed the middle of the scrollport. */
  private findActive(acts: ScrollyAct[], metrics: ActMetrics[]): string | null {
    let active: string | null = null;
    acts.forEach((act, i) => {
      if (!act.actLabel()) return;
      if (active === null || metrics[i].top <= this.viewport / 2) active = act.actId();
    });
    return active;
  }
}
