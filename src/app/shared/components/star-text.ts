import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GAME_ICONS } from '../../core/game/game-assets';

/** Text where every ★ is drawn with the in-game star (e.g. table headers like "3★ %"). */
@Component({
  selector: 'crn-star-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './star-text.html',
  styleUrl: './star-text.scss',
})
export class StarText {
  readonly text = input.required<string>();

  protected readonly star = GAME_ICONS.star;
  /** The text around the stars: a star goes between two consecutive parts. */
  protected readonly parts = computed(() => this.text().split('★'));
}
