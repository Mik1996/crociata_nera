import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** One part of a segmented meter: its share of `max` and its colour (a `var(--cn-*)` token). */
export interface MeterSegment {
  value: number;
  color: string;
}

/** Fill of a single-value meter: `fire` red to gold, `gold`, `danger` (e.g. over capacity). */
export type MeterTone = 'fire' | 'gold' | 'danger';

/**
 * Thin horizontal bar showing a value out of `max` (attendance, averages, capacity), or several
 * segments side by side (a score made of parts). Values are clamped to the track.
 *
 * Decorative (`aria-hidden`) unless `label` is given: then it is a `meter` with that text.
 * Customise from the page with `--crn-meter-height`, `--crn-meter-track`, `--crn-meter-fill`,
 * `--crn-meter-glow`; give it a width or a flex basis there.
 */
@Component({
  selector: 'crn-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'meter meter--' + tone()",
    '[class.meter--reverse]': 'reverse()',
    '[attr.role]': "label() ? 'meter' : null",
    '[attr.aria-hidden]': "label() ? null : 'true'",
    '[attr.aria-valuenow]': 'label() ? value() : null',
    '[attr.aria-valuemin]': 'label() ? 0 : null',
    '[attr.aria-valuemax]': 'label() ? max() : null',
    '[attr.aria-valuetext]': 'label() || null',
  },
  templateUrl: './meter.html',
  styleUrl: './meter.scss',
})
export class Meter {
  readonly value = input(0);
  readonly max = input(100);
  /** Parts drawn one after the other instead of the single value. */
  readonly segments = input<readonly MeterSegment[] | null>(null);
  readonly tone = input<MeterTone>('fire');
  /** Fills from the right (e.g. the opponent's side). */
  readonly reverse = input(false);
  /** Accessible text of the value (e.g. "12 of 45"). */
  readonly label = input<string | null>(null);

  protected readonly parts = computed(() => {
    const segments = this.segments() ?? [{ value: this.value(), color: '' }];
    let left = 100;
    return segments.map((segment) => {
      const width = Math.min(left, share(segment.value, this.max()));
      left -= width;
      return { width, color: segment.color || null };
    });
  });
}

function share(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(100, (value / max) * 100);
}
