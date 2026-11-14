import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  NgZone,
  signal,
} from '@angular/core';

/**
 * Put on a marker at the end of a list: {@link visible} turns true when the marker comes within
 * one screen of being seen, so the next page can be asked for before the user gets there (endless
 * list). It stays true while the marker is near: after a page too short to fill the screen it is
 * still true and the next page is asked for too.
 *
 * The screen is the nearest scrolling ancestor (on short screens the `.page__scroll` area does not
 * scroll, the page does), looked for again when the window is resized. Without
 * `IntersectionObserver` the marker always counts as near (every page is read).
 */
@Directive({ selector: '[crnNearEnd]' })
export class NearEnd {
  /** How far ahead of the visible part, as `IntersectionObserver.rootMargin` (one screen below). */
  readonly margin = input('0% 0% 100% 0%', { alias: 'crnNearEndMargin' });

  readonly visible = signal(false);

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        this.visible.set(true);
        return;
      }
      let root: Element | null | undefined;
      let observer: IntersectionObserver | undefined;
      const observe = () => {
        const scroller = scrollingAncestor(element);
        if (observer && scroller === root) return;
        observer?.disconnect();
        root = scroller;
        observer = new IntersectionObserver(
          (entries) => this.visible.set(entries.at(-1)!.isIntersecting),
          {
            root,
            rootMargin: this.margin(),
          },
        );
        observer.observe(element);
      };
      zone.runOutsideAngular(() => {
        observe();
        window.addEventListener('resize', observe, { passive: true });
      });
      destroyRef.onDestroy(() => {
        window.removeEventListener('resize', observe);
        observer?.disconnect();
      });
    });
  }
}

/** The nearest ancestor that scrolls vertically; `null` (the viewport) when none does. */
function scrollingAncestor(element: HTMLElement): Element | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}
