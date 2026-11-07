import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { CocApiService } from '../../core/api/coc-api';
import { capitalHallImage, capitalLeagueIcon, warLeagueIcon } from '../../core/game/clan-assets';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { LoadState } from '../../shared/components/load-state';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { ClanRules } from '../recruitment/clan-rules';
import { RecruitmentBanner } from '../recruitment/recruitment-banner';

/**
 * Home page and recruiting page: the clan presented like a game banner. The badge is the
 * centrepiece, under a flaming metallic clan name; Clan Capital and Clan War League panels
 * follow, then the recruitment pitch with the in-game join link and the clan rules.
 * Data comes from `GET /clans/{tag}`.
 */
@Component({
  selector: 'app-welcome-page',
  imports: [MatIconModule, TranslatePipe, LocalNumberPipe, LoadState, ScrollFade, RecruitmentBanner, ClanRules],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './welcome-page.html',
  styleUrl: './welcome-page.scss',
})
export class WelcomePage {
  private readonly api = inject(CocApiService);
  protected readonly clan = rxResource({ stream: () => this.api.getClan() });

  protected readonly data = computed(() => (this.clan.hasValue() ? this.clan.value() : null));

  protected readonly capitalHall = computed(() => capitalHallImage(this.data()?.capitalHallLevel ?? 0));
  protected readonly capitalLeagueIcon = computed(() => capitalLeagueIcon(this.data()?.capitalLeague));
  protected readonly warLeagueIcon = computed(() => warLeagueIcon(this.data()?.warLeague?.name));

  /** Played wars with a known result (for the win rate). */
  protected readonly winRate = computed(() => {
    const clan = this.data();
    const played = clan ? clan.warWins + clan.warLosses + clan.warTies : 0;
    return played ? clan!.warWins / played : null;
  });

  /** Official badge failed to load: the heraldic placeholder is shown instead. */
  protected readonly badgeFailed = signal(false);
}
