import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/backend/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import {
  Commendation,
  CommendationType,
  PlayerCommendations,
  PlayerProfile,
} from '../../../core/models';
import { emblemOf, nameKeyOf, styleOf, thresholdOf } from '../../../core/utils/commendations';
import { Icon } from '../../../shared/components/icon/icon';
import { Tag } from '../../../shared/components/tag/tag';
import { XpBadge } from '../../../shared/game/xp-badge';
import { roleKey } from '../../../shared/labels';
import { Medal3dImage } from '../../../shared/medal-3d/medal-3d-image';
import { CommendationDialogOpener } from './open-commendation-dialog';

/**
 * Game-style profile header: Town Hall, experience level, name, clan, league, trophies and
 * the commendations (last completed month, last Raid Weekend, last Clan War League, last season).
 */
@Component({
  selector: 'crn-player-banner',
  imports: [Icon, MatTooltipModule, TranslatePipe, LocalNumberPipe, XpBadge, Medal3dImage, Tag],
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
  private readonly medalDialog = inject(CommendationDialogOpener);
  private readonly auth = inject(AuthService);
  /** Medals with what the template needs to name and describe them. */
  protected readonly medals = computed(() => {
    const c = this.commendations();
    if (!c) return [];
    const locale = this.language.current();
    // Day, month and year: these medals belong to one precise period (the last war, Raid Weekend,
    // CWL…), so the dialog and the share card say exactly when.
    const date = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Rome',
    });
    const range = (dates: { startTime: string; endTime: string }) =>
      dateRange(new Date(dates.startTime), new Date(dates.endTime), locale);
    // Period of each kind of commendation, shown in the tooltip and the dialog.
    const periods: Partial<Record<CommendationType, string>> = {
      capitalRaider: c.raidWeekend ? range(c.raidWeekend) : undefined,
      cwlStriker: c.cwlDates ? `CWL ${range(c.cwlDates)}` : undefined,
      cwlAllAttacks: c.cwlDates ? `CWL ${range(c.cwlDates)}` : undefined,
      legendTop: c.legendSeason
        ? this.language.t('commendations.legendSeasonPeriod', {
            date: date.format(new Date(c.legendSeason.endTime)),
          })
        : undefined,
      donor: c.donationDates ? range(c.donationDates) : undefined,
    };
    const month = range(monthDates(c.month));
    return c.items.map((item) => ({
      ...item,
      emblem: emblemOf(item),
      nameKey: nameKeyOf(item),
      style: styleOf(item),
      threshold: thresholdOf(item),
      // One-off war commendations: the day of the war that earned them (last month or this one).
      period:
        periods[item.type] ??
        (c.warEnds?.[item.type] ? date.format(new Date(c.warEnds[item.type]!)) : month),
    }));
  });
  protected readonly roleKey = roleKey;

  /** Opens the medal in 3D, with the period it was earned in; the owner may share it. */
  protected open3d(medal: Commendation & { period: string }): Promise<void> {
    const profile = this.profile();
    return this.medalDialog.open({
      type: medal.type,
      tier: medal.tier,
      period: medal.period,
      share: this.auth.isMyPlayer(profile.tag) ? { player: profile.name } : undefined,
    });
  }
}

/** First and last day of a month (`YYYY-MM`), at noon UTC: the same days in every time zone. */
function monthDates(month: string): { startTime: string; endTime: string } {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return {
    startTime: new Date(Date.UTC(year, m - 1, 1, 12)).toISOString(),
    endTime: new Date(Date.UTC(year, m, 0, 12)).toISOString(),
  };
}

/**
 * A period with day, month and year in the order of the language ("3–11 novembre 2026", "November
 * 3 – 11, 2026"), Rome time. The days lose their leading zero: Italian pads them ("03–11").
 */
function dateRange(start: Date, end: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  })
    .formatRangeToParts(start, end)
    .map((part) => (part.type === 'day' ? String(Number(part.value)) : part.value))
    .join('');
}
