import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTabGroup } from '@angular/material/tabs';
import { merge } from 'rxjs';

/**
 * Tab bar scrolled with the finger instead of Material's pagination arrows (styles:
 * `.cn-swipe-tabs` in `styles.scss`). The selected or keyboard-focused tab is brought into view.
 */
@Directive({
  selector: 'mat-tab-group[appSwipeTabs]',
  host: { class: 'cn-swipe-tabs' },
})
export class SwipeTabs {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const group = inject(MatTabGroup);
    group.disablePagination = true;
    merge(group.selectedIndexChange, group.focusChange)
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((change) => this.reveal(typeof change === 'number' ? change : change.index));
  }

  /** Scrolls the bar (only the bar, never the page) to centre a tab. */
  reveal(index: number): void {
    const bar = this.host.querySelector<HTMLElement>('.mat-mdc-tab-label-container');
    const tab = this.host.querySelectorAll<HTMLElement>('.mat-mdc-tab').item(index);
    if (!bar || !tab) return;
    const [barBox, tabBox] = [bar.getBoundingClientRect(), tab.getBoundingClientRect()];
    const left = bar.scrollLeft + tabBox.left - barBox.left - (barBox.width - tabBox.width) / 2;
    const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bar.scrollTo?.({ left, behavior: reduced ? 'auto' : 'smooth' });
  }
}
