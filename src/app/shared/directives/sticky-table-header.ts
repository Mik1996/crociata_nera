import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';

/** Name of the scroll timeline set on the scrolling area of every table (see `styles.scss`). */
const TIMELINE = '--cn-table-scroll';

/**
 * Sticky table header for every table wrapper (`.cn-table-wrap`): while the table scrolls, its
 * header row stays at the top of the scrolling area (page, tab or main content), so the columns
 * are always visible.
 *
 * Plain `position: sticky` cannot do it: the wrapper scrolls horizontally on narrow screens
 * (`overflow-x: auto`), and that makes the wrapper itself — which never scrolls vertically —
 * the sticky container. The header cells are moved with a transform instead, kept inside the
 * table (they stop above its last row), so they also follow the horizontal scroll.
 *
 * The transform is a scroll-driven animation (`animation-timeline` on the scrolling area): the
 * browser moves the header together with the scroll, in the same frame. Setting the transform from
 * a scroll listener would always be one frame late, and the header would shake while scrolling.
 * This directive only measures where the table sits in the scrolling area (which does not change
 * while scrolling); browsers without scroll-driven animations get the transform from here.
 */
@Directive({
  selector: '.cn-table-wrap',
})
export class StickyTableHeader {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly scrollDriven =
    typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'scroll()');
  private frame = 0;
  private offset = 0;
  private range = '';

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const schedule = () => {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.update());
      };

      zone.runOutsideAngular(() => {
        // Any scrolling area may move the table: listen to all of them (scroll does not bubble).
        document.addEventListener('scroll', schedule, { capture: true, passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        // Rows added or removed (data loaded, sorting, filters) change where the header must stop.
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
        resize?.observe(this.element);

        destroyRef.onDestroy(() => {
          document.removeEventListener('scroll', schedule, { capture: true });
          window.removeEventListener('resize', schedule);
          resize?.disconnect();
          cancelAnimationFrame(this.frame);
        });
      });

      schedule();
    });
  }

  private update(): void {
    const cells = this.element.querySelectorAll<HTMLElement>(
      'thead th, tr.mat-mdc-header-row > th',
    );
    const headerRow = cells[0]?.parentElement;
    if (!headerRow) return;

    const scroller = scrollingAncestor(this.element);
    const area = scroller ?? document.documentElement;
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    const table = this.element.getBoundingClientRect();
    const header = headerRow.getBoundingClientRect().height;
    const lastRow =
      this.element.querySelector('tbody tr:last-child')?.getBoundingClientRect().height ?? 0;

    // How far the header can travel (it stops above the last row), and the scroll position at
    // which the table top reaches the top of the area.
    const distance = Math.max(0, Math.round(table.height - header - lastRow));
    const offset = Math.round(Math.max(0, Math.min(top - table.top, distance)));

    if (this.scrollDriven) {
      const start = Math.round(table.top - top + area.scrollTop);
      const range = `${start} ${distance}`;
      if (area.style.getPropertyValue('scroll-timeline-name') !== TIMELINE)
        area.style.setProperty('scroll-timeline-name', TIMELINE);
      if (range !== this.range) {
        this.range = range;
        this.element.style.setProperty('--cn-sticky-start', `${start}px`);
        this.element.style.setProperty('--cn-sticky-distance', `${distance}px`);
      }
      this.element.classList.add('cn-table-wrap--scroll-driven');
    }

    if (offset === this.offset) return;
    this.offset = offset;

    if (!this.scrollDriven)
      for (const cell of Array.from(cells))
        cell.style.transform = offset ? `translateY(${offset}px)` : '';
    this.element.classList.toggle('cn-table-wrap--stuck', offset > 0);
  }
}

/** Nearest ancestor that scrolls vertically; `null` means the page itself. */
function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (
    let node = element.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight)
      return node;
  }
  return null;
}
