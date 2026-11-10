import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Horizontal track of a pinned act (e.g. a gallery that slides sideways while scrolling down):
 * writes `--track-shift`, how far the track must move (in px) to show its last item, so CSS can
 * translate it by `calc(var(--p) * var(--track-shift) * -1)`. Measured against the parent.
 */
@Directive({
  selector: '[appScrollyTrack]',
  host: { class: 'scrolly-track' },
})
export class ScrollyTrack {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const parent = this.element.parentElement;
      const measure = () => {
        const shift = Math.max(0, this.element.scrollWidth - (parent?.clientWidth ?? 0));
        this.element.style.setProperty('--track-shift', `${shift}px`);
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(this.element);
      if (parent) observer.observe(parent);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
