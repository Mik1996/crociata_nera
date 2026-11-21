import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { GAME_ICONS } from '../../core/game/game-assets';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { LanguageService } from '../../core/i18n/language.service';
import { formatLocalDate } from '../../core/i18n/locale-pipes';
import { WarService } from '../../core/services/war.service';
import { computeWarKpi } from '../../core/utils/war-stats';
import { Icon } from '../../shared/components/icon/icon';
import { KpiCard } from '../../shared/components/kpi-card/kpi-card';
import { LoadState } from '../../shared/components/load-state/load-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PdfButton } from '../../shared/components/pdf-button/pdf-button';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { WarParticipantsTable } from './components/war-participants-table';
import { WarSummary } from './components/war-summary';
import { warReportPdf } from './war-report-pdf';

@Component({
  selector: 'crn-war-detail-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatButtonModule,
    Icon,
    PageHeader,
    LoadState,
    KpiCard,
    WarSummary,
    WarParticipantsTable,
    ScrollFade,
    PdfButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './war-detail-page.html',
  styleUrl: './war-detail-page.scss',
})
export class WarDetailPage {
  protected readonly GAME_ICONS = GAME_ICONS;

  private readonly wars = inject(WarService);
  private readonly language = inject(LanguageService);

  /** Route parameter `:id` (bound automatically by the router). */
  readonly id = input.required<string>();

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.wars.getWar(params),
  });
  protected readonly war = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  /** The report of the war as a PDF, for the leaders (`null` without the attacks' detail). */
  protected readonly reportPdf = computed(() => {
    const war = this.war();
    if (!war?.hasDetails) return null;
    const locale = this.language.current();
    return warReportPdf(war, {
      t: (key, params) => this.language.t(key, params),
      locale,
      dayLabel: formatLocalDate(war.endTime, 'd MMM yyyy', locale),
    });
  });
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w?.hasDetails ? computeWarKpi(w) : null;
  });
}
