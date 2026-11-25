import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { CommendationTier, CommendationType } from '../../../core/models';
import { AuthService } from '../../../core/backend/auth.service';
import { EarnedCommendation } from '../../../core/backend/backend-api.types';
import { CommendationService } from '../../../core/services/commendation.service';
import {
  COMMENDATION_TYPES,
  emblemOf,
  isSingle,
  medalsOf,
  nameKeyOf,
  styleOf,
  thresholdOf,
} from '../../../core/utils/commendations';
import { LoadState } from '../../../shared/components/load-state/load-state';
import { Medal3dImage } from '../../../shared/medal-3d/medal-3d-image';
import { CommendationDialogOpener } from './open-commendation-dialog';

/**
 * "Commendations" tab of the player page: every medal (bronze, silver and gold of each
 * commendation, or the single medal of a one-off one, in its own colour) with how many times the
 * player earned it; medals never earned are shown in greyscale.
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
  /** In-game name of the player, printed on the share card of their own medals. */
  readonly playerName = input('');


  private readonly commendations = inject(CommendationService);
  private readonly medalDialog = inject(CommendationDialogOpener);
  private readonly auth = inject(AuthService);

  protected readonly history = rxResource({
    params: () => this.tag(),
    stream: ({ params }) => this.commendations.historyForPlayer(params),
  });

  private readonly earned = computed(() => (this.history.hasValue() ? this.history.value() : []));

  /**
   * One row per commendation, bronze → gold (read from left to right), with the count of each
   * medal. A one-off commendation has a single medal, on a panel of its colour (`style`).
   */
  protected readonly rows = computed(() => {
    const counts = new Map(this.earned().map((c) => [medalName(c), c.quantity]));
    return COMMENDATION_TYPES.map((type) => ({
      type,
      style: isSingle(type) ? styleOf({ type, tier: null }) : null,
      medals: medalsOf(type)
        .reverse()
        .map((medal) => ({
          tier: medal.tier,
          emblem: emblemOf(medal),
          nameKey: nameKeyOf(medal),
          style: styleOf(medal),
          threshold: thresholdOf(medal),
          count: counts.get(emblemOf(medal)) ?? 0,
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
    return this.earned().filter((c) => !known.has(medalName(c)));
  });

  protected readonly nameKeyOf = nameKeyOf;

  protected readonly total = computed(() => this.earned().reduce((sum, c) => sum + c.quantity, 0));

  /** Opens the medal in 3D; the owner may share it. */
  protected open3d(type: CommendationType, tier: CommendationTier | null, count: number): Promise<void> {
    const share = this.auth.isMyPlayer(this.tag()) ? { player: this.playerName() } : undefined;
    return this.medalDialog.open({ type, tier, count, share });
  }
}

/** Name of a saved medal (its image): `<type>-<tier>`, the type alone for a one-off commendation. */
function medalName(c: EarnedCommendation): string {
  return c.tier ? `${c.type}-${c.tier}` : c.type;
}
