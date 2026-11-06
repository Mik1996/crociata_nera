import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';

/**
 * Experience level as in the game: a blue 12-point star with the number drawn on top of it.
 * The star is a background layer (clipped), the number sits above it and is never clipped,
 * so long levels (e.g. 288) can overflow the star like in the game.
 */
@Component({
  selector: 'app-xp-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  template: `<span class="xp__number" aria-hidden="true">{{ level() }}</span>`,
  styles: `
    :host {
      --star: polygon(
        50% 0%, 60.4% 11.4%, 75% 6.7%, 78.3% 21.7%, 93.3% 25%, 88.6% 39.6%,
        100% 50%, 88.6% 60.4%, 93.3% 75%, 78.3% 78.3%, 75% 93.3%, 60.4% 88.6%,
        50% 100%, 39.6% 88.6%, 25% 93.3%, 21.7% 78.3%, 6.7% 75%, 11.4% 60.4%,
        0% 50%, 11.4% 39.6%, 6.7% 25%, 21.7% 21.7%, 25% 6.7%, 39.6% 11.4%
      );
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 3em;
      height: 3em;
      flex: none;
      font-family: var(--cn-font-display);
      font-weight: 700;
      font-size: var(--cn-fs-md);
      color: #ffffff;
    }
    /* Dark outline of the star. */
    :host::before,
    :host::after {
      content: '';
      position: absolute;
      clip-path: var(--star);
    }
    :host::before {
      inset: 0;
      background: #0b2547;
    }
    /* Blue body of the star. */
    :host::after {
      inset: 0.12em;
      background: radial-gradient(circle at 50% 35%, #8fd0ff 0%, #3a8ee6 50%, #1d57a8 100%);
    }
    .xp__number {
      position: relative;
      z-index: 1;
      white-space: nowrap;
      letter-spacing: -0.02em;
      text-shadow:
        0 2px 0 #0b2547,
        1px 1px 0 #0b2547,
        -1px 1px 0 #0b2547,
        1px -1px 0 #0b2547,
        -1px -1px 0 #0b2547;
    }
  `,
})
export class XpBadge {
  readonly level = input.required<number>();

  private readonly language = inject(LanguageService);
  protected readonly label = computed(() => this.language.t('player.expLevel', { n: this.level() }));
}
