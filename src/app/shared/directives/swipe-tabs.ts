import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTabGroup, MatTabNav } from '@angular/material/tabs';
import { merge } from 'rxjs';

/** Scroll area and tabs of the two kinds of tab bar. */
const PARTS = {
  group: { bar: '.mat-mdc-tab-label-container', tab: '.mat-mdc-tab' },
  nav: { bar: '.mat-mdc-tab-link-container', tab: '.mat-mdc-tab-link' },
} as const;

/**
 * Tab bar scrolled with the finger instead of Material's pagination arrows (styles:
 * `.cn-swipe-tabs` in `styles.scss`), on a `mat-tab-group` or a `mat-tab-nav-bar` (tabs of links).
 * The selected or keyboard-focused tab is brought into view.
 */
@Directive({
  selector: 'mat-tab-group[crnSwipeTabs], [mat-tab-nav-bar][crnSwipeTabs]',
  host: { class: 'cn-swipe-tabs', '(focusin)': 'onFocus($event)', '(click)': 'onFocus($event)' },
})
export class SwipeTabs {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly group = inject(MatTabGroup, { optional: true });
  private readonly parts = this.group ? PARTS.group : PARTS.nav;

  constructor() {
    const group = this.group;
    if (group) {
      group.disablePagination = true;
      merge(group.selectedIndexChange, group.focusChange)
        .pipe(takeUntilDestroyed(inject(DestroyRef)))
        .subscribe((change) => this.reveal(typeof change === 'number' ? change : change.index));
    } else {
      inject(MatTabNav).disablePagination = true;
      // A link bar has no selection event: its active link comes from the page (e.g. the URL).
      afterNextRender(() => {
        const active = this.host.querySelector<HTMLElement>(`${this.parts.tab}.mdc-tab--active`);
        if (active) this.revealTab(active);
      });
    }
  }

  /** Scrolls the bar (only the bar, never the page) to centre a tab. */
  reveal(index: number): void {
    const tab = this.host.querySelectorAll<HTMLElement>(this.parts.tab).item(index);
    if (tab) this.revealTab(tab);
  }

  /** Links focused with the keyboard or clicked (and so becoming active) come into view. */
  protected onFocus(event: Event): void {
    if (this.group) return;
    const tab = (event.target as Element | null)?.closest<HTMLElement>(this.parts.tab);
    if (tab) this.revealTab(tab);
  }

  private revealTab(tab: HTMLElement): void {
    const bar = this.host.querySelector<HTMLElement>(this.parts.bar);
    if (!bar) return;
    const [barBox, tabBox] = [bar.getBoundingClientRect(), tab.getBoundingClientRect()];
    const left = bar.scrollLeft + tabBox.left - barBox.left - (barBox.width - tabBox.width) / 2;
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bar.scrollTo?.({ left, behavior: reduced ? 'auto' : 'smooth' });
  }
}
