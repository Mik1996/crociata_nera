import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommendationEmblem } from '../../core/models';

/**
 * Medal of a commendation, drawn in `public/commendations/<emblem>.svg` (e.g. `wall-gold`).
 * Decorative: the accessible name is given by the parent (tooltip and label).
 * Default width 72px (square medal); the parent can resize it by setting `width` on the element.
 */
@Component({
  selector: 'crn-commendation-medal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commendation-medal.html',
  styleUrl: './commendation-medal.scss',
})
export class CommendationMedal {
  readonly emblem = input.required<CommendationEmblem>();

  protected readonly src = computed(() => `commendations/${this.emblem()}.svg`);
}
