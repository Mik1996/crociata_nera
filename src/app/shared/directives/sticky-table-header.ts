import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';

/**
 * Sticky table header for every table wrapper (`.cn-table-wrap`): while the table scrolls, its
 * header row stays at the top of the scrolling area (page, tab or main content), so the columns
 * are always visible.
 *
 * Plain `position: sticky` cannot do it: the wrapper scrolls horizontally on narrow screens
 * (`overflow-x: auto`), and that makes the wrapper itself — which never scrolls vertically —
 * the sticky container. The header cells are moved with a transform instead, kept inside the
 * table (they stop above its last row), so they also follow the horizontal scroll.
 */
@Directive({
  selector: '.cn-table-wrap',
})
export class StickyTableHeader {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private frame = 0;
  private offset = 0;

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
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    const table = this.element.getBoundingClientRect();
    const header = headerRow.getBoundingClientRect().height;
    const lastRow =
      this.element.querySelector('tbody tr:last-child')?.getBoundingClientRect().height ?? 0;

    // Distance the table top has scrolled past the top of the area, kept above the last row.
    const offset = Math.round(
      Math.max(0, Math.min(top - table.top, table.height - header - lastRow)),
    );
    if (offset === this.offset) return;
    this.offset = offset;

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
