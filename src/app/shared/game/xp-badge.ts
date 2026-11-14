import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';

/**
 * Experience level as in the game: a blue 12-point star with the number drawn on top of it.
 * The star is a background layer (clipped), the number sits above it and is never clipped,
 * so long levels (e.g. 288) can overflow the star like in the game.
 */
@Component({
  selector: 'crn-xp-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  templateUrl: './xp-badge.html',
  styleUrl: './xp-badge.scss',
})
export class XpBadge {
  readonly level = input.required<number>();

  private readonly language = inject(LanguageService);
  protected readonly label = computed(() => this.language.t('player.expLevel', { n: this.level() }));
}
