import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { CommendationType, PlayerCommendations, PlayerProfile } from '../../../core/models';
import { COMMENDATION_THRESHOLDS, emblemOf } from '../../../core/utils/commendations';
import { periodLabel } from '../../../core/utils/monthly-history';
import { CommendationMedal } from '../../../shared/game/commendation-medal';
import { XpBadge } from '../../../shared/game/xp-badge';
import { roleKey } from '../../../shared/labels';

/**
 * Game-style profile header: Town Hall, experience level, name, clan, league, trophies and
 * the commendations (last completed month, last Raid Weekend, last Clan War League).
 */
@Component({
  selector: 'app-player-banner',
  imports: [MatIconModule, MatTooltipModule, TranslatePipe, LocalNumberPipe, XpBadge, CommendationMedal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-banner.html',
  styleUrl: './player-banner.scss',
})
export class PlayerBanner {
  readonly profile = input.required<PlayerProfile>();
  /** Commendations; the row is hidden when there are none. */
  readonly commendations = input<PlayerCommendations | null>(null);

  private readonly language = inject(LanguageService);
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
  protected readonly weaponStars = (n: number) => Array.from({ length: n });
}
