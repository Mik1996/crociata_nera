import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** Width change of one arrow key press on a focused handle. */
const KEY_STEP = 16;

/**
 * Resizable columns for every table wrapper (`.cn-table-wrap`): each header cell gets a handle on
 * its right edge. Drag it (mouse, pen or touch) or focus it and use the arrow keys to change the
 * column width; double-click it to give every column its automatic width back.
 *
 * At the first resize the current (automatic) widths are frozen and the table switches to a fixed
 * layout, so only the dragged column changes; a wider table scrolls horizontally inside its
 * wrapper. A column can grow but never get narrower than its automatic width.
 */
@Directive({
  selector: '.cn-table-wrap',
})
export class ResizableColumns {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly translate = inject(TranslateService);
  private frame = 0;
  /** Automatic width of each column, measured when the widths were frozen: the minimum. */
  private autoWidths: number[] = [];

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      zone.runOutsideAngular(() => {
        const schedule = () => {
          cancelAnimationFrame(this.frame);
          this.frame = requestAnimationFrame(() => this.addHandles());
        };
        // Header rendered later (data loaded, @if blocks) or rebuilt (columns changed).
        const mutations = new MutationObserver(schedule);
        mutations.observe(this.element, { childList: true, subtree: true });
        destroyRef.onDestroy(() => {
          mutations.disconnect();
          cancelAnimationFrame(this.frame);
        });
        schedule();
      });
    });
  }

  private headerCells(): HTMLTableCellElement[] {
    return Array.from(this.element.querySelectorAll<HTMLTableCellElement>('thead tr:first-child > th'));
  }

  private table(): HTMLTableElement | null {
    return this.element.querySelector('table');
  }

  /** One handle per header cell; cells that already have one are left alone. */
  private addHandles(): void {
    const cells = this.headerCells();
    // Columns added or removed: frozen widths no longer match, back to automatic widths.
    if (this.element.classList.contains('cn-table-wrap--resized') && cells.some((c) => !c.style.width)) this.reset();

    for (const cell of cells) {
      if (cell.querySelector(':scope > .cn-col-resizer')) continue;
      const handle = document.createElement('span');
      handle.className = 'cn-col-resizer';
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      const name = cell.textContent?.trim() ?? '';
      handle.setAttribute('aria-label', this.translate.instant('table.resizeColumn', { name }));
      handle.title = this.translate.instant('table.resizeHint');

      // The handle sits inside sortable headers: never let it sort the column.
      handle.addEventListener('click', (event) => event.stopPropagation());
      handle.addEventListener('pointerdown', (event) => this.startDrag(event, cell, handle));
      handle.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        this.reset();
      });
      handle.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0;
        if (!step) return;
        event.preventDefault();
        event.stopPropagation();
        this.freeze();
        this.resize(cell, cell.getBoundingClientRect().width + step);
      });
      cell.appendChild(handle);
    }
  }

  private startDrag(event: PointerEvent, cell: HTMLTableCellElement, handle: HTMLElement): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.freeze();
    const startX = event.clientX;
    const startWidth = cell.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    this.element.classList.add('cn-table-wrap--resizing');

    const move = (e: PointerEvent) => this.resize(cell, startWidth + e.clientX - startX);
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      this.element.classList.remove('cn-table-wrap--resizing');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** Fixes every column to its current width (once), so resizing one does not move the others. */
  private freeze(): void {
    const table = this.table();
    if (!table || this.element.classList.contains('cn-table-wrap--resized')) return;
    const cells = this.headerCells();
    const widths = cells.map((c) => c.getBoundingClientRect().width);
    this.autoWidths = widths;
    cells.forEach((c, i) => (c.style.width = `${widths[i]}px`));
    table.style.minWidth = '0';
    table.style.width = `${widths.reduce((sum, w) => sum + w, 0)}px`;
    table.style.tableLayout = 'fixed';
    this.element.classList.add('cn-table-wrap--resized');
  }

  private resize(cell: HTMLTableCellElement, width: number): void {
    const table = this.table();
    if (!table) return;
    const min = this.autoWidths[this.headerCells().indexOf(cell)] ?? 0;
    cell.style.width = `${Math.round(Math.max(min, width))}px`;
    const total = this.headerCells().reduce((sum, c) => sum + parseFloat(c.style.width || '0'), 0);
    table.style.width = `${total}px`;
  }

  /** Automatic widths again. */
  private reset(): void {
    for (const cell of this.headerCells()) cell.style.width = '';
    const table = this.table();
    if (table) {
      table.style.width = '';
      table.style.minWidth = '';
      table.style.tableLayout = '';
    }
    this.element.classList.remove('cn-table-wrap--resized');
    this.autoWidths = [];
  }
}
