import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { formatLocalNumber } from '../../core/i18n/locale-pipes';
import { ScrollyAct } from './scrolly-act';
import { ActMetrics, easeOutCubic, segment } from './scrolly-math';

/** Metric of the act that drives a counter. */
export type CounterMetric = 'progress' | 'enter';

/**
 * Number that counts up while the act progresses (`counterFrom`–`counterTo` of the chosen
 * metric), formatted in the user's language. Writes the text directly, outside change detection.
 *
 * The digits change on every frame, so the element is hidden from assistive technologies: put the
 * final value next to it in a `.cn-visually-hidden` element.
 */
@Directive({
  selector: '[appScrollyCounter]',
  host: { 'aria-hidden': 'true' },
})
export class ScrollyCounter {
  readonly appScrollyCounter = input.required<number>();
  readonly counterFrom = input(0);
  readonly counterTo = input(0.6);
  readonly counterMetric = input<CounterMetric>('progress');
  /** Digits format, as for `formatNumber` (e.g. `'1.0-0'`). */
  readonly counterFormat = input<string | undefined>(undefined);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly act = inject(ScrollyAct, { optional: true });
  private readonly language = inject(LanguageService);
  private shown = '';

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Not in the constructor: an act that already has metrics calls back at once, before the
    // inputs are set (counters created later, e.g. when the rankings arrive).
    afterNextRender(() => {
      const stop = this.act?.onFrame((metrics) => this.render(metrics));
      destroyRef.onDestroy(() => stop?.());
    });
    // First value, new value or language: shown at once.
    effect(() => {
      this.appScrollyCounter();
      this.language.current();
      this.render(this.act?.current ?? null);
    });
  }

  private render(metrics: ActMetrics | null): void {
    const target = this.appScrollyCounter();
    const t = metrics ? segment(metrics[this.counterMetric()], this.counterFrom(), this.counterTo()) : 1;
    const value = t >= 1 ? target : Math.round(target * easeOutCubic(t));
    const text = formatLocalNumber(value, this.language.current(), this.counterFormat());
    if (text === this.shown) return;
    this.shown = text;
    this.element.textContent = text;
  }
}
