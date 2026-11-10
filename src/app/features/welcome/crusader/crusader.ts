import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CrusadeOrder } from '../../../core/config/sister-clans';

/**
 * Poses of the Black Crusader, the clan's mascot (pictures in `public/images/crusader/`). The Red
 * and the Gold Crusaders of the sister clans only have `stand`.
 */
export type CrusaderPose = 'stand' | 'guard' | 'heart' | 'fist' | 'oath';

/** Widths of the pictures (1024 × 1536 originals, 2:3). */
const WIDTHS = [360, 640, 1024] as const;

/** Picture of a pose at a given width (`crusader-stand-640`, `crusader-red-stand-640`…). */
export function crusaderImage(pose: CrusaderPose, width: (typeof WIDTHS)[number] = 640, order: CrusadeOrder = 'black'): string {
  const name = order === 'black' ? pose : `${order}-${pose}`;
  return `images/crusader/crusader-${name}-${width}.webp`;
}

/**
 * The Black Crusader ("Crociato Nero"), the clan's own character, in one of his poses: a glow
 * behind him (colour from `--crusader-glow`), a slow breathing and a fog veil at his feet.
 *
 * The parent places and sizes the host (2:3 box) and drives the entrance with `--crusader-in`
 * (0 hidden in the fog, 1 fully visible), usually from the act's progress. Decorative: no alt text.
 */
@Component({
  selector: 'app-crusader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crusader.html',
  styleUrl: './crusader.scss',
  host: { 'aria-hidden': 'true', '[attr.data-pose]': 'pose()', '[attr.data-order]': 'order()' },
})
export class Crusader {
  readonly pose = input.required<CrusaderPose>();
  /** Black Crusader (Crociata Nera) or the Crusader of a sister clan. */
  readonly order = input<CrusadeOrder>('black');
  /** Displayed width, for the browser's choice among the picture sizes. */
  readonly sizes = input('min(60vh, 70vw)');
  /** First picture on screen: loaded at once instead of lazily. */
  readonly priority = input(false);

  protected readonly src = computed(() => crusaderImage(this.pose(), 640, this.order()));
  protected readonly srcset = computed(() =>
    WIDTHS.map((w) => `${crusaderImage(this.pose(), w, this.order())} ${w}w`).join(', '),
  );
}
