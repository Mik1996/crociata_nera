import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { injectPublicClans } from '../../core/api/public-clans';
import { injectSisterClans } from '../../core/api/sister-clans';
import { LoadState } from '../../shared/components/load-state/load-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { ClanRules } from './clan-rules';
import { RecruitmentBanner } from './recruitment-banner';

/**
 * "Join us" page (public): the recruitment pitch with the in-game join links of Crociata Nera and
 * of its sister clans, and the clan rules.
 */
@Component({
  selector: 'crn-join-page',
  imports: [TranslatePipe, LoadState, PageHeader, ScrollFade, RecruitmentBanner, ClanRules],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './join-page.html',
  styleUrl: './join-page.scss',
})
export class JoinPage {
  /** The public data of the clans of the Crusade (`GET /welcome`): loading, error, retry. */
  protected readonly clan = injectPublicClans();
  protected readonly data = computed(() => (this.clan.hasValue() ? this.clan.value().clan : null));
  protected readonly sisters = injectSisterClans();
}
