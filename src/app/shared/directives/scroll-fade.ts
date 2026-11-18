import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone, signal } from '@angular/core';

/**
 * Scroll hint for scrollable areas: a light blurred band at the top when there is content
 * above, and at the bottom when there is content below (styles: `.cn-scroll-fade` in
 * `styles.scss`). Nothing is shown when the content fits.
 *
 * Tracks scrolling, size changes of the area and of its content (data loading, tab
 * switches, window resize): the area and its children are resized-observed, and only the lists of
 * children of the area (and of inline hosts in it) are watched for changes.
 */
@Directive({
  selector: '[crnScrollFade]',
  host: {
    class: 'cn-scroll-fade',
    '[class.cn-scroll-fade--top]': 'top()',
    '[class.cn-scroll-fade--bottom]': 'bottom()',
  },
})
export class ScrollFade {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly top = signal(false);
  protected readonly bottom = signal(false);

  /** Below this distance from an edge, that edge counts as reached. */
  private static readonly THRESHOLD = 4;
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

        // Not available in every environment (e.g. some test DOMs): scroll and mutations still work.
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
        // Only lists of children are watched, never the whole subtree: content changing inside a
        // child resizes it, which the ResizeObserver reports.
        const mutations = new MutationObserver(() => {
          observeChildren();
          schedule();
        });
        const observeChildren = () => {
          resize?.disconnect();
          mutations.disconnect();
          resize?.observe(this.element);
          mutations.observe(this.element, { childList: true });
          observeBoxes(this.element.children);
        };
        // Inline hosts such as <crn-load-state> have no size of their own to observe: their
        // children are observed instead, and their list of children is watched too (content
        // rendered later, @if blocks).
        const observeBoxes = (children: HTMLCollection) => {
          for (const child of Array.from(children)) {
            if (hasNoBox(child)) {
              mutations.observe(child, { childList: true });
              observeBoxes(child.children);
            } else {
              resize?.observe(child);
            }
          }
        };
        observeChildren();

        destroyRef.onDestroy(() => {
          this.element.removeEventListener('scroll', schedule);
          resize?.disconnect();
          mutations.disconnect();
          cancelAnimationFrame(this.frame);
        });
      });

      schedule();
    });
  }

  private update(): void {
    const { scrollTop, scrollHeight, clientHeight } = this.element;
    const overflow = scrollHeight - clientHeight > ScrollFade.THRESHOLD;
    this.top.set(overflow && scrollTop > ScrollFade.THRESHOLD);
    this.bottom.set(overflow && scrollTop + clientHeight < scrollHeight - ScrollFade.THRESHOLD);
  }
}

/** Inline or `display: contents` elements: their size does not follow their content. */
function hasNoBox(element: Element): boolean {
  const display = getComputedStyle(element).display;
  return display === 'inline' || display === 'contents';
}
