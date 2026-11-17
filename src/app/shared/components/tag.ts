import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Colour of a tag (meaning, not hue): every tone works with every appearance. */
export type TagTone = 'neutral' | 'gold' | 'danger' | 'success' | 'me' | 'starter' | 'reserve';
/** `outline`: coloured text and edge; `solid`: filled; `soft`: tinted background, coloured edge. */
export type TagAppearance = 'outline' | 'solid' | 'soft';
/** `s`: small caps label inside rows; `m`: states next to titles; `l`: badges in banners. */
export type TagSize = 's' | 'm' | 'l';

/**
 * Short label in a pill: states ("Ongoing", "Ended"), flags ("New"), roles, "You".
 * The text is projected; add `matTooltip` and `tabindex="0"` on the element for an explanation.
 */
@Component({
  selector: 'crn-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  templateUrl: './tag.html',
  styleUrl: './tag.scss',
})
export class Tag {
  readonly tone = input<TagTone>('neutral');
  readonly appearance = input<TagAppearance>('outline');
  readonly size = input<TagSize>('s');

  protected readonly classes = computed(
    () => `tag tag--${this.tone()} tag--${this.appearance()} tag--${this.size()}`,
  );
}
