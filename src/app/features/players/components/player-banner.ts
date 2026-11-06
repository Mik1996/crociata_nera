import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { PlayerCommendations, PlayerProfile } from '../../../core/models';
import { COMMENDATION_THRESHOLDS, emblemOf } from '../../../core/utils/commendations';
import { periodLabel } from '../../../core/utils/monthly-history';
import { CommendationMedal } from '../../../shared/game/commendation-medal';
import { XpBadge } from '../../../shared/game/xp-badge';
import { roleKey } from '../../../shared/labels';

/**
 * Game-style profile header: Town Hall, experience level, name, clan, league, trophies and
 * the commendations earned in the last completed month.
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
  /** Monthly commendations; the row is hidden when there are none. */
  readonly commendations = input<PlayerCommendations | null>(null);

  private readonly language = inject(LanguageService);
  /** Medals with what the template needs to name and describe them. */
  protected readonly medals = computed(() =>
    (this.commendations()?.items ?? []).map((c) => ({
      ...c,
      emblem: emblemOf(c),
      threshold: COMMENDATION_THRESHOLDS[c.type][c.tier],
    })),
  );
  /** E.g. "Ottobre 2026", in the current language. */
  protected readonly commendationMonth = computed(() => {
    const c = this.commendations();
    return c ? periodLabel(c.month, this.language.current()) : '';
  });
  protected readonly roleKey = roleKey;
  protected readonly weaponStars = (n: number) => Array.from({ length: n });
}
