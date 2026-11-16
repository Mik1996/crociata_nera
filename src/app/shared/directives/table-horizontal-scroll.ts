import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone, signal } from '@angular/core';

/** Below this distance from the right edge, the edge counts as reached. */
const THRESHOLD = 4;

/**
 * Horizontal scroll hint of every table wrapper (`.cn-table-wrap`), which scrolls sideways on
 * narrow screens: `cn-table-wrap--more-x` while there are columns beyond the right edge, which
 * then fades (scrollbars are hidden site-wide). Styles in `styles.scss`.
 *
 * Tracks scrolling and size changes of the wrapper and of the table (data loaded, columns
 * resized, window resized).
 */
@Directive({
  selector: '.cn-table-wrap',
  host: { '[class.cn-table-wrap--more-x]': 'more()' },
})
export class TableHorizontalScroll {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly more = signal(false);
  private frame = 0;

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const schedule = () => {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.update());
      };

      zone.runOutsideAngular(() => {
        this.element.addEventListener('scroll', schedule, { passive: true });
        // Not available in every environment (e.g. some test DOMs): scrolling still works.
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
        resize?.observe(this.element);
        for (const child of Array.from(this.element.children)) resize?.observe(child);

        destroyRef.onDestroy(() => {
          this.element.removeEventListener('scroll', schedule);
          resize?.disconnect();
          cancelAnimationFrame(this.frame);
        });
      });

      schedule();
    });
  }

  private update(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.element;
    // Right-to-left layouts scroll with negative positions: only the distance matters.
    this.more.set(Math.abs(scrollLeft) + clientWidth < scrollWidth - THRESHOLD);
  }
}
