import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { CommendationTier, CommendationType } from '../../../core/models';
import { emblemOf, nameKeyOf, styleOf, thresholdOf } from '../../../core/utils/commendations';
import { Icon } from '../../../shared/components/icon/icon';
import { Medal3dViewer } from '../../../shared/medal-3d/medal-3d-viewer';
import { CommendationShareDialog, CommendationShareData } from './commendation-share-dialog';

export interface CommendationDialogData {
  type: CommendationType;
  /** `null` for a one-off commendation (no tier shown). */
  tier: CommendationTier | null;
  /** Times the player earned it: 0 shows the locked medal. Unknown when opened from one period. */
  count?: number;
  /** Period the medal was earned in (already formatted), shown when the count is unknown. */
  period?: string;
  /**
   * The medal belongs to the signed-in user: they may share it ("Share" button, only once earned).
   * `player` is the in-game name of their account.
   */
  share?: { player: string };
}

/**
 * A commendation medal in 3D, with its name, requirement and how many times it was earned.
 * Imports Three.js: open it through a dynamic `import()` so it is loaded only when needed.
 */
@Component({
  selector: 'crn-commendation-dialog',
  imports: [MatDialogModule, MatButtonModule, TranslatePipe, LocalNumberPipe, Medal3dViewer, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commendation-dialog.html',
  styleUrl: './commendation-dialog.scss',
})
export class CommendationDialog {
  protected readonly data = inject<CommendationDialogData>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  private readonly language = inject(LanguageService);

  protected readonly svgUrl = `commendations/${emblemOf(this.data)}.svg`;
  /** Metal of the tier, or the colour of a one-off commendation. */
  protected readonly finish = styleOf(this.data);
  protected readonly locked = this.data.count === 0;
  protected readonly hasCount = this.data.count !== undefined;
  /** Only the owner shares, and only a medal earned. */
  protected readonly shareable = !!this.data.share && !this.locked;
  protected readonly threshold = thresholdOf(this.data);
  protected readonly nameKey = nameKeyOf(this.data);
  protected readonly countKey = computed(() =>
    this.data.count === 0
      ? 'commendations.viewer.notEarned'
      : this.data.count === 1
        ? 'commendations.viewer.earnedOne'
        : 'commendations.viewer.earned',
  );

  /** Opens the share card of the medal: period it was earned in, or how many times. */
  protected share(): void {
    const { type, tier, count, period, share } = this.data;
    if (!share || this.locked) return;
    const detail =
      period ??
      this.language.t(count === 1 ? 'commendations.viewer.earnedOne' : 'commendations.viewer.earned', {
        n: count,
      });
    this.dialog.open<CommendationShareDialog, CommendationShareData>(CommendationShareDialog, {
      data: { type, tier, player: share.player, detail },
      width: '30rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: false,
    });
  }
}
