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
  template: `
    <div
      class="unit__tile"
      [matTooltip]="unit().name + ' · ' + ('player.level' | translate: { level: unit().level, max: unit().maxLevel })"
    >
      @if (unit().icon; as icon) {
        <img [src]="icon" alt="" loading="lazy" decoding="async" />
      } @else {
        <span class="unit__initials" aria-hidden="true">{{ initials() }}</span>
      }
      <app-level-badge class="unit__badge" [level]="unit().level" [maxed]="maxed()" />
    </div>
    <span class="unit__name">{{ unit().name }}</span>
    <span class="cn-visually-hidden">
      {{ (maxed() ? 'player.maxed' : 'player.level') | translate: { level: unit().level, max: unit().maxLevel } }}
    </span>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      width: var(--tile, 72px);
      text-align: center;
    }
    :host(.unit--small) {
      --tile: 48px;
    }
    .unit__tile {
      position: relative;
      width: var(--tile, 72px);
      height: var(--tile, 72px);
      border-radius: 10px;
      background: var(--cn-game-tile);
      border: 2px solid var(--cn-game-tile-border);
      box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.35);
    }
    :host(.unit--max) .unit__tile {
      border-color: var(--cn-game-gold);
    }
    :host(.unit--inactive) img {
      filter: grayscale(0.9);
      opacity: 0.6;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 4px;
      box-sizing: border-box;
      border-radius: 8px;
    }
    .unit__initials {
      display: grid;
      place-items: center;
      height: 100%;
      font-family: var(--cn-font-display);
      font-size: var(--cn-fs-lg);
      color: #ffffff;
    }
    .unit__badge {
      position: absolute;
      left: 3px;
      bottom: 3px;
      z-index: 1;
    }
    .unit__name {
      font-size: var(--cn-fs-2xs);
      line-height: 1.2;
      color: var(--cn-text-muted);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    :host(.unit--small) .unit__name {
      display: none;
    }
  `,
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
