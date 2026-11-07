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

  private readonly earned = computed(() => (this.history.hasValue() ? this.history.value() : []));

  /** One row per commendation, bronze → gold, with the count of each medal. */
  protected readonly rows = computed(() => {
    const counts = new Map(this.earned().map((c) => [`${c.type}-${c.tier}`, c.quantity]));
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

  /**
   * Saved commendations that are not among the current ones (renamed or retired after they
   * were awarded): still part of the player's history, translated from their type and tier
   * (the keys must stay in the translation files).
   */
  protected readonly others = computed(() => {
    const known = new Set(this.rows().flatMap((r) => r.medals.map((m) => m.emblem as string)));
    return this.earned().filter((c) => !known.has(`${c.type}-${c.tier}`));
  });

  protected readonly total = computed(() => this.earned().reduce((sum, c) => sum + c.quantity, 0));
}
