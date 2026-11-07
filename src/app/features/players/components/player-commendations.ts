import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { CommendationTier } from '../../../core/models';
import { CommendationService } from '../../../core/services/commendation.service';
import {
  COMMENDATION_THRESHOLDS,
  COMMENDATION_TIERS,
  COMMENDATION_TYPES,
  emblemOf,
} from '../../../core/utils/commendations';
import { LoadState } from '../../../shared/components/load-state';
import { CommendationMedal } from '../../../shared/game/commendation-medal';

/** Tiers from the lowest, as they are read from left to right. */
const TIERS_ASCENDING: readonly CommendationTier[] = [...COMMENDATION_TIERS].reverse();

/**
 * "Commendations" tab of the player page: every medal (8 commendations × bronze, silver, gold)
 * with how many times the player earned it; medals never earned are shown in greyscale.
 */
@Component({
  selector: 'app-player-commendations',
  imports: [TranslatePipe, LocalNumberPipe, MatTooltipModule, LoadState, CommendationMedal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-commendations.html',
  styleUrl: './player-commendations.scss',
})
export class PlayerCommendations {
  readonly tag = input.required<string>();

  private readonly commendations = inject(CommendationService);

  protected readonly history = rxResource({
    params: () => this.tag(),
    stream: ({ params }) => this.commendations.historyForPlayer(params),
  });

  /** One row per commendation, bronze → gold, with the count of each medal. */
  protected readonly rows = computed(() => {
    const counts = this.history.hasValue() ? this.history.value() : new Map();
    return COMMENDATION_TYPES.map((type) => ({
      type,
      medals: TIERS_ASCENDING.map((tier) => ({
        tier,
        emblem: emblemOf({ type, tier }),
        threshold: COMMENDATION_THRESHOLDS[type][tier],
        count: counts.get(emblemOf({ type, tier })) ?? 0,
      })),
    }));
  });

  protected readonly total = computed(() =>
    this.rows().reduce((sum, row) => sum + row.medals.reduce((s, m) => s + m.count, 0), 0),
  );
}
