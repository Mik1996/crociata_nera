import { Directive, input } from '@angular/core';

/** Act metric that moves a parallax layer. */
export type ParallaxMetric = 'p' | 't';

/**
 * Parallax layer of an act: moves by `depth` scrollports (negative = against the scroll) over the
 * act's progress, centred on its middle. `axis` x makes it slide sideways. Pure CSS (`.scrolly-layer`
 * in `_scrolly.scss`): only the custom properties are set here.
 *
 * Inside a pinned stage use the default metric `p`; for a layer of a non-pinned act use `t`.
 */
@Directive({
  selector: '[crnParallax]',
  host: {
    class: 'scrolly-layer',
    '[class.scrolly-layer--x]': "parallaxAxis() === 'x'",
    '[class.scrolly-layer--t]': "parallaxOn() === 't'",
    '[style.--depth]': 'crnParallax()',
  },
})
export class ScrollyParallax {
  readonly crnParallax = input.required<number>();
  readonly parallaxAxis = input<'x' | 'y'>('y');
  readonly parallaxOn = input<ParallaxMetric>('p');
}
