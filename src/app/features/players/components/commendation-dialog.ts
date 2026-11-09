import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { CommendationTier, CommendationType } from '../../../core/models';
import { COMMENDATION_THRESHOLDS, emblemOf } from '../../../core/utils/commendations';
import { MedalFinish } from '../../../shared/medal-3d/medal-finish';
import { Medal3dViewer } from '../../../shared/medal-3d/medal-3d-viewer';

export interface CommendationDialogData {
  type: CommendationType;
  tier: CommendationTier;
  /** Times the player earned it: 0 shows the locked medal. Unknown when opened from one period. */
  count?: number;
  /** Period the medal was earned in (already formatted), shown when the count is unknown. */
  period?: string;
}

/** Metal of each tier; a future tier or a one-off medal adds its own finish here. */
const TIER_FINISHES: Readonly<Record<CommendationTier, MedalFinish>> = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  legendary: 'legendary',
};

/**
 * A commendation medal in 3D, with its name, requirement and how many times it was earned.
 * Imports Three.js: open it through a dynamic `import()` so it is loaded only when needed.
 */
@Component({
  selector: 'app-commendation-dialog',
  imports: [MatDialogModule, MatButtonModule, TranslatePipe, LocalNumberPipe, Medal3dViewer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commendation-dialog.html',
  styleUrl: './commendation-dialog.scss',
})
export class CommendationDialog {
  protected readonly data = inject<CommendationDialogData>(MAT_DIALOG_DATA);

  protected readonly svgUrl = `commendations/${emblemOf(this.data)}.svg`;
  protected readonly finish = TIER_FINISHES[this.data.tier];
  protected readonly locked = this.data.count === 0;
  protected readonly hasCount = this.data.count !== undefined;
  protected readonly threshold = COMMENDATION_THRESHOLDS[this.data.type][this.data.tier];
  protected readonly nameKey = `commendations.${this.data.type}.${this.data.tier}`;
  protected readonly countKey = computed(() =>
    this.data.count === 0
      ? 'commendations.viewer.notEarned'
      : this.data.count === 1
        ? 'commendations.viewer.earnedOne'
        : 'commendations.viewer.earned',
  );
}
