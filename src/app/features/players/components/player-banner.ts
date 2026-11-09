import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { Commendation, CommendationType, PlayerCommendations, PlayerProfile } from '../../../core/models';
import { COMMENDATION_THRESHOLDS, emblemOf } from '../../../core/utils/commendations';
import { periodLabel } from '../../../core/utils/monthly-history';
import { XpBadge } from '../../../shared/game/xp-badge';
import { Medal3dImage } from '../../../shared/medal-3d/medal-3d-image';
import { roleKey } from '../../../shared/labels';
import { openCommendationDialog } from './open-commendation-dialog';

/**
 * Game-style profile header: Town Hall, experience level, name, clan, league, trophies and
 * the commendations (last completed month, last Raid Weekend, last Clan War League).
 */
@Component({
  selector: 'app-player-banner',
  imports: [MatIconModule, MatTooltipModule, TranslatePipe, LocalNumberPipe, XpBadge, Medal3dImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-banner.html',
  styleUrl: './player-banner.scss',
})
export class PlayerBanner {
  readonly profile = input.required<PlayerProfile>();
  /** Commendations; the row is hidden when there are none. */
  readonly commendations = input<PlayerCommendations | null>(null);

  /** Width of a medal in CSS pixels (the 3D image is drawn for it). */
  protected readonly medalSize = 80;

  private readonly language = inject(LanguageService);
  private readonly dialog = inject(MatDialog);
  /** Medals with what the template needs to name and describe them. */
  protected readonly medals = computed(() => {
    const c = this.commendations();
    if (!c) return [];
    const locale = this.language.current();
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
    // Period of each kind of commendation, shown in the tooltip.
    const periods: Partial<Record<CommendationType, string>> = {
      capitalRaider: c.raidWeekend
        ? `${day.format(new Date(c.raidWeekend.startTime))} – ${day.format(new Date(c.raidWeekend.endTime))}`
        : undefined,
      cwlStriker: c.cwlSeason ? `CWL ${periodLabel(c.cwlSeason, locale)}` : undefined,
    };
    const month = periodLabel(c.month, locale);
    return c.items.map((item) => ({
      ...item,
      emblem: emblemOf(item),
      threshold: COMMENDATION_THRESHOLDS[item.type][item.tier],
      period: periods[item.type] ?? month,
    }));
  });
  protected readonly roleKey = roleKey;

  /** Opens the medal in 3D, with the period it was earned in. */
  protected open3d(medal: Commendation & { period: string }): Promise<void> {
    return openCommendationDialog(this.dialog, { type: medal.type, tier: medal.tier, period: medal.period });
  }
}
