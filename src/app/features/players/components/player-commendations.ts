import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { CommendationTier, CommendationType } from '../../../core/models';
import { CommendationService } from '../../../core/services/commendation.service';
import { COMMENDATION_THRESHOLDS, COMMENDATION_TYPES, emblemOf, tiersOf } from '../../../core/utils/commendations';
import { LoadState } from '../../../shared/components/load-state';
import { Medal3dImage } from '../../../shared/medal-3d/medal-3d-image';
import { openCommendationDialog } from './open-commendation-dialog';

/**
 * "Commendations" tab of the player page: every medal (bronze, silver and gold of each
 * commendation, or its single legendary medal) with how many times the player earned it;
 * medals never earned are shown in greyscale.
 */
@Component({
  selector: 'crn-player-commendations',
  imports: [TranslatePipe, LocalNumberPipe, MatTooltipModule, LoadState, Medal3dImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-commendations.html',
  styleUrl: './player-commendations.scss',
})
export class PlayerCommendations {
  readonly tag = input.required<string>();

  /** Width of a medal in CSS pixels (the 3D image is drawn for it). */
  protected readonly medalSize = 104;

  private readonly commendations = inject(CommendationService);
  private readonly dialog = inject(MatDialog);

  protected readonly history = rxResource({
    params: () => this.tag(),
    stream: ({ params }) => this.commendations.historyForPlayer(params),
  });

  private readonly earned = computed(() => (this.history.hasValue() ? this.history.value() : []));

  /**
   * One row per commendation, bronze → gold (read from left to right), with the count of each
   * medal. A one-off commendation has a single, legendary medal.
   */
  protected readonly rows = computed(() => {
    const counts = new Map(this.earned().map((c) => [`${c.type}-${c.tier}`, c.quantity]));
    return COMMENDATION_TYPES.map((type) => ({
      type,
      legendary: tiersOf(type).includes('legendary'),
      medals: tiersOf(type).reverse().map((tier) => ({
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

  /** Opens the medal in 3D. */
  protected open3d(type: CommendationType, tier: CommendationTier, count: number): Promise<void> {
    return openCommendationDialog(this.dialog, { type, tier, count });
  }
}
