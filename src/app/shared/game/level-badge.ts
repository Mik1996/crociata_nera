import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Game-style level badge: white border, black background and white number.
 * At max level the background turns gold and the badge is wrapped in a light animated flame
 * (static glow when the user prefers reduced motion). Decorative: the parent provides the
 * accessible text. Position it from the parent; size it with the `--size` custom property.
 */
@Component({
  selector: 'app-level-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.level--max]': 'maxed()' },
  templateUrl: './level-badge.html',
  styleUrl: './level-badge.scss',
})
export class LevelBadge {
  readonly level = input.required<number>();
  readonly maxed = input(false);
}
