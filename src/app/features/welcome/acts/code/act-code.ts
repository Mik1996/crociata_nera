import { ChangeDetectionStrategy, Component, effect, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ScrollyAct } from '../../../../shared/scrolly/scrolly-act';
import { ActMetrics, clamp01 } from '../../../../shared/scrolly/scrolly-math';
import { ClanRules } from '../../../recruitment/clan-rules';
import { Crusader } from '../../../../shared/crusader/crusader';
import { ActHeading } from '../act-heading/act-heading';

/** Scroll taller than this (minus the margins) cannot be seen whole: the reveal follows a line. */
const FIT_MARGIN = 16;
/** Reveal line of a scroll taller than the scrollport, as a fraction of it. */
const REVEAL_LINE = 0.82;

/**
 * How much of the scroll is unrolled, in px. A scroll that fits in the scrollport is unrolled
 * from when its top enters at the bottom until it is centred, so it is complete before the next
 * act shows up; a taller one is revealed down to a line near the bottom of the scrollport.
 */
export function scrollReveal({ top, height, viewport }: ActMetrics): number {
  if (viewport <= 0) return height;
  if (height <= viewport - 2 * FIT_MARGIN) {
    const centred = (viewport - height) / 2;
    return height * clamp01((viewport - top) / (viewport - centred));
  }
  return Math.min(height, Math.max(0, viewport * REVEAL_LINE - top));
}

/**
 * Act V, the code: the Crusader takes the oath and the clan rules unroll on a parchment scroll as
 * the reader goes down. Not pinned: the lower roller follows `--reveal` ({@link scrollReveal}).
 * The scroll is an act of its own (without a label), for its position.
 */
@Component({
  selector: 'crn-act-code',
  imports: [TranslatePipe, ActHeading, Crusader, ClanRules, ScrollyAct],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: ScrollyAct, inputs: ['actId', 'actLabel', 'actLength'] }],
  templateUrl: './act-code.html',
  styleUrl: './act-code.scss',
})
export class ActCode {
  private readonly scroll = viewChild.required('scroll', { read: ScrollyAct });

  constructor() {
    effect((onCleanup) => {
      const scroll = this.scroll();
      let written = '';
      onCleanup(
        scroll.onFrame((metrics) => {
          const reveal = `${Math.round(scrollReveal(metrics))}px`;
          if (reveal === written) return;
          written = reveal;
          scroll.element.style.setProperty('--reveal', reveal);
        }),
      );
    });
  }
}
