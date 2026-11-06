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
  template: `
    @if (maxed()) {
      <span class="level__flame"></span>
    }
    <span class="level__number">{{ level() }}</span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }
    .level__number {
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
      font-size: var(--size, var(--cn-fs-xs));
      font-weight: 700;
      line-height: 1.4;
      text-align: center;
    }
    /* Max level: gold background, white number with a dark outline (for contrast), wrapped in a flame. */
    :host(.level--max) .level__number {
      background: linear-gradient(180deg, #ffd964 0%, #f4b51f 100%);
      text-shadow:
        0 1px 0 #3d2400,
        1px 1px 0 #3d2400,
        -1px 1px 0 #3d2400,
        1px -1px 0 #3d2400,
        -1px -1px 0 #3d2400;
    }
    .level__flame {
      position: absolute;
      inset: -45% -30% -10%;
      pointer-events: none;
    }
    .level__flame::before,
    .level__flame::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50% 50% 45% 45% / 65% 65% 35% 35%;
      transform-origin: 50% 100%;
      filter: blur(1.5px);
    }
    .level__flame::before {
      background: radial-gradient(ellipse at 50% 85%, rgba(255, 236, 140, 0.95) 0%, rgba(255, 152, 31, 0.85) 38%, rgba(226, 58, 12, 0.55) 62%, transparent 78%);
      animation: level-flame 0.9s ease-in-out infinite alternate;
    }
    .level__flame::after {
      inset: 10% 15% 0;
      background: radial-gradient(ellipse at 50% 90%, rgba(255, 250, 200, 0.9) 0%, rgba(255, 190, 60, 0.7) 40%, transparent 72%);
      animation: level-flame 0.7s ease-in-out -0.35s infinite alternate-reverse;
    }
    @keyframes level-flame {
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
      .level__flame::before,
      .level__flame::after {
        animation: none;
      }
    }
  `,
})
export class LevelBadge {
  readonly level = input.required<number>();
  readonly maxed = input(false);
}
