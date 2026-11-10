import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { CocApiService } from '../../core/api/coc-api';
import { injectSisterClans } from '../../core/api/sister-clans';
import { warLeagueIcon } from '../../core/game/clan-assets';
import { LanguageService } from '../../core/i18n/language.service';
import { LoadState } from '../../shared/components/load-state';
import { ScrollyIndex } from '../../shared/scrolly/scrolly-index';
import { ScrollyRoot } from '../../shared/scrolly/scrolly-root';
import { ActAnnals, RecordTile } from './acts/annals/act-annals';
import { ActArmy } from './acts/army/act-army';
import { ActCall } from './acts/call/act-call';
import { ActCapital } from './acts/capital/act-capital';
import { ActCode } from './acts/code/act-code';
import { ActPrologue } from './acts/prologue/act-prologue';
import { ActSister } from './acts/sister/act-sister';
import { ActWar } from './acts/war/act-war';

/**
 * Home page and recruiting page, told as a scrollytelling story in acts (engine:
 * `shared/scrolly/`): prologue with the clan name and badge, the army in numbers, the Clan
 * Capital, war and the Clan War League, the all-time records, the clan rules, the sister clans and
 * the call to join.
 * The Black Crusader, the clan's mascot, changes pose from act to act.
 *
 * Data comes from `GET /clans/{tag}` (proxy); rankings and records are a bonus (hidden while
 * loading or on error), the records from the backend.
 */
@Component({
  selector: 'app-welcome-page',
  imports: [
    TranslatePipe,
    LoadState,
    ScrollyRoot,
    ScrollyIndex,
    ActPrologue,
    ActArmy,
    ActCapital,
    ActWar,
    ActAnnals,
    ActCode,
    ActSister,
    ActCall,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill page--immersive' },
  templateUrl: './welcome-page.html',
  styleUrl: './welcome-page.scss',
})
export class WelcomePage {
  private readonly api = inject(CocApiService);
  protected readonly clan = rxResource({ stream: () => this.api.getClan() });

  protected readonly data = computed(() => (this.clan.hasValue() ? this.clan.value() : null));

  private readonly ranksResource = rxResource({ stream: () => this.api.getClanRanks() });
  protected readonly ranks = computed(() => (this.ranksResource.hasValue() ? this.ranksResource.value() : null));

  private readonly recordsResource = rxResource({ stream: () => this.api.getClanRecords() });
  protected readonly records = computed<RecordTile[] | null>(() => {
    if (!this.recordsResource.hasValue()) return null;
    const r = this.recordsResource.value();
    const country = this.country();
    return [
      {
        id: 'perfectWars',
        label: 'welcome.records.perfectWars',
        value: r.perfectWars.value,
        image: 'game/misc/three-stars.webp',
        achievedAt: r.perfectWars.achievedAt,
      },
      {
        id: 'warWinStreak',
        label: 'welcome.records.winStreak',
        value: r.warWinStreak.value,
        image: 'game/misc/clan-war.webp',
        achievedAt: r.warWinStreak.achievedAt,
      },
      {
        id: 'cwlLeague',
        label: 'welcome.records.cwlLeague',
        text: r.cwlLeague.name,
        image: warLeagueIcon(r.cwlLeague.name) ?? 'game/misc/clan-war.webp',
        achievedAt: r.cwlLeague.achievedAt,
      },
      {
        id: 'localRank',
        label: country ? 'welcome.records.localRank' : 'welcome.records.localRankNoCountry',
        country,
        rank: r.localRank.value,
        // The flag of the country of the ranking (only the Italian one is drawn).
        ...(this.data()?.countryCode === 'IT' ? { flag: true } : { icon: 'emoji_events' }),
        achievedAt: r.localRank.achievedAt,
      },
      {
        id: 'localCapitalRank',
        label: country ? 'welcome.records.capitalRank' : 'welcome.records.capitalRankNoCountry',
        country,
        rank: r.localCapitalRank.value,
        image: 'game/leagues/legend.webp',
        achievedAt: r.localCapitalRank.achievedAt,
      },
      {
        id: 'capitalPoints',
        label: 'welcome.records.capitalPoints',
        value: r.capitalPoints.value,
        image: 'game/misc/capital-trophy.webp',
        achievedAt: r.capitalPoints.achievedAt,
      },
    ];
  });

  /** Sister clans read from the Clash of Clans API: one that cannot be read leaves its act out. */
  protected readonly sisters = injectSisterClans();

  /** Scrollports of pinned scrolling for the records: half a scrollport per tablet. */
  protected readonly annalsLength = computed(() => 1.2 + (this.records()?.length ?? 0) * 0.4);

  private readonly language = inject(LanguageService);
  /** Country of the clan in the current language (e.g. "Italia"), from its country code. */
  protected readonly country = computed(() => {
    const code = this.data()?.countryCode;
    if (!code) return null;
    try {
      return new Intl.DisplayNames([this.language.current()], { type: 'region' }).of(code) ?? null;
    } catch {
      return null;
    }
  });
}
