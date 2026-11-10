import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { CocApiService } from '../../core/api/coc-api';
import { injectSisterClans } from '../../core/api/sister-clans';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { ClanRules } from './clan-rules';
import { RecruitmentBanner } from './recruitment-banner';

/**
 * "Join us" page (public): the recruitment pitch with the in-game join links of Crociata Nera and
 * of its sister clans, and the clan rules.
 */
@Component({
  selector: 'app-join-page',
  imports: [TranslatePipe, LoadState, PageHeader, ScrollFade, RecruitmentBanner, ClanRules],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './join-page.html',
  styleUrl: './join-page.scss',
})
export class JoinPage {
  private readonly api = inject(CocApiService);
  protected readonly clan = rxResource({ stream: () => this.api.getClan() });
  protected readonly data = computed(() => (this.clan.hasValue() ? this.clan.value() : null));
  protected readonly sisters = injectSisterClans();
}
