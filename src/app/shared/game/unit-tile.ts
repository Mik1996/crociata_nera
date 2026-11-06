import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerUnit } from '../../core/models';

/**
 * Game-style unit card: icon on a dark tile with the level badge in the corner
 * (gold when the unit is maxed). Falls back to the initials when no icon is available.
 */
@Component({
  selector: 'app-unit-tile',
  imports: [MatTooltipModule, TranslatePipe],
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
      <span class="unit__badge" aria-hidden="true">
        @if (maxed()) {
          <span class="unit__flame"></span>
        }
        <span class="unit__level">{{ unit().level }}</span>
      </span>
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
    /* Level badge in the bottom-left corner: white border, black background, white number. */
    .unit__badge {
      position: absolute;
      left: 3px;
      bottom: 3px;
      z-index: 1;
    }
    .unit__level {
      position: relative;
      z-index: 1;
      display: block;
      min-width: 1.35em;
      padding: 0 0.3em;
      border: 1.5px solid #ffffff;
      border-radius: 5px;
      background: #141414;
      color: #ffffff;
      font-family: var(--cn-font-display);
      font-size: var(--cn-fs-xs);
      font-weight: 700;
      line-height: 1.4;
      text-align: center;
    }
    /* Max level: gold background, white number with a dark outline (for contrast), wrapped in a flame. */
    :host(.unit--max) .unit__level {
      background: linear-gradient(180deg, #ffd964 0%, #f4b51f 100%);
      text-shadow:
        0 1px 0 #3d2400,
        1px 1px 0 #3d2400,
        -1px 1px 0 #3d2400,
        1px -1px 0 #3d2400,
        -1px -1px 0 #3d2400;
    }
    .unit__flame {
      position: absolute;
      inset: -45% -30% -10%;
      pointer-events: none;
    }
    .unit__flame::before,
    .unit__flame::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50% 50% 45% 45% / 65% 65% 35% 35%;
      transform-origin: 50% 100%;
      filter: blur(1.5px);
    }
    .unit__flame::before {
      background: radial-gradient(ellipse at 50% 85%, rgba(255, 236, 140, 0.95) 0%, rgba(255, 152, 31, 0.85) 38%, rgba(226, 58, 12, 0.55) 62%, transparent 78%);
      animation: unit-flame 0.9s ease-in-out infinite alternate;
    }
    .unit__flame::after {
      inset: 10% 15% 0;
      background: radial-gradient(ellipse at 50% 90%, rgba(255, 250, 200, 0.9) 0%, rgba(255, 190, 60, 0.7) 40%, transparent 72%);
      animation: unit-flame 0.7s ease-in-out -0.35s infinite alternate-reverse;
    }
    @keyframes unit-flame {
      0% {
        transform: scale(1, 1) translateY(0) skewX(0deg);
        opacity: 0.85;
      }
      50% {
        transform: scale(0.94, 1.18) translateY(-1px) skewX(-4deg);
        opacity: 1;
      }
      100% {
        transform: scale(1.05, 1.08) translateY(0) skewX(4deg);
        opacity: 0.9;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .unit__flame::before,
      .unit__flame::after {
        animation: none;
      }
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
