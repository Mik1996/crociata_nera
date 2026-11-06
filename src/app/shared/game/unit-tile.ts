import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerUnit } from '../../core/models';
import { LevelBadge } from './level-badge';

/**
 * Game-style unit card: icon on a dark tile with the level badge in the corner
 * (gold when the unit is maxed). Falls back to the initials when no icon is available.
 */
@Component({
  selector: 'app-unit-tile',
  imports: [MatTooltipModule, TranslatePipe, LevelBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'listitem',
    '[class.unit--max]': 'maxed()',
    '[class.unit--small]': 'small()',
    '[class.unit--inactive]': 'inactive()',
  },
  templateUrl: './unit-tile.html',
  styleUrl: './unit-tile.scss',
})
export class UnitTile {
  readonly unit = input.required<PlayerUnit>();
  readonly small = input(false);
  readonly inactive = input(false);

  protected readonly maxed = computed(() => this.unit().level >= this.unit().maxLevel);
  protected readonly initials = computed(() =>
    this.unit()
      .name.split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  );
}
