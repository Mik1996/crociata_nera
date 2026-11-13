import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GAME_ICONS } from '../../core/game/game-assets';
import { LanguageService } from '../../core/i18n/language.service';

/** Displays the stars of an attack with the in-game pictures (gold, grey when missed) and an accessible label. */
@Component({
  selector: 'app-stars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  templateUrl: './stars.html',
  styleUrl: './stars.scss',
})
export class Stars {
  readonly value = input.required<number>();
  readonly max = input(3);

  protected readonly starImage = GAME_ICONS.star;
  protected readonly emptyStarImage = GAME_ICONS['star-neutral'];

  protected readonly stars = computed(() =>
    Array.from({ length: this.max() }, (_, i) => i < this.value()),
  );
  private readonly language = inject(LanguageService);
  protected readonly label = computed(() => this.language.t('stars.label', { value: this.value(), max: this.max() }));
}
