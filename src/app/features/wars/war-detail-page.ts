import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { WarService } from '../../core/services/war.service';
import { computeWarKpi, participantRows } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { WarParticipantsTable } from './components/war-participants-table';
import { WarSummary } from './components/war-summary';

@Component({
  selector: 'app-war-detail-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    LoadState,
    KpiCard,
    WarSummary,
    WarParticipantsTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  template: `
    <app-page-header
      [title]="war() ? ('warDetail.versus' | translate: { name: war()!.opponent.name }) : ('nav.warDetail' | translate)"
      [subtitle]="'warDetail.subtitle' | translate"
    >
      <a mat-stroked-button routerLink="/wars">
        <mat-icon aria-hidden="true">arrow_back</mat-icon> {{ 'warDetail.back' | translate }}
      </a>
    </app-page-header>

    <div class="page__scroll">
      <app-load-state
        [loading]="resource.isLoading()"
        [error]="resource.error()"
        [empty]="!war()"
        emptyIcon="search_off"
        [emptyMessage]="'warDetail.notFound' | translate"
        (retry)="resource.reload()"
      >
        @if (war(); as w) {
          <section class="cn-card cn-section" [attr.aria-label]="'common.battleSummary' | translate">
            <app-war-summary [war]="w" />
          </section>

          @if (!w.hasDetails) {
            <section class="cn-card cn-section notice" role="note">
              <mat-icon aria-hidden="true">info</mat-icon>
              <div>
                <h2>{{ 'warDetail.noticeTitle' | translate }}</h2>
                <p class="cn-muted">{{ 'warDetail.noticeText' | translate }}</p>
              </div>
            </section>
          }

          @if (kpi(); as k) {
            <div class="cn-grid-kpi">
              <app-kpi-card icon="bolt" [label]="'common.attacksUsed' | translate" [value]="k.attacksUsed + '/' + k.attacksAvailable" />
              <app-kpi-card
                icon="star"
                [label]="'common.averageStars' | translate"
                [value]="(k.averageStars | localNumber: '1.2-2') ?? '0'"
                [hint]="'common.perAttack' | translate"
              />
              <app-kpi-card
                icon="military_tech"
                [label]="'common.threeStarAttacks' | translate"
                [value]="(k.threeStarRate | localNumber: '1.0-1') + '%'"
              />
              <app-kpi-card
                icon="groups"
                [label]="'common.participation' | translate"
                [value]="(k.participation | localNumber: '1.0-0') + '%'"
                [hint]="'warDetail.participationHint' | translate"
              />
            </div>
          }

          @if (w.hasDetails) {
            <section class="cn-card cn-section" aria-labelledby="performance-title">
              <h2 id="performance-title">{{ 'warDetail.performance' | translate }}</h2>
              <app-war-participants-table
                [rows]="rows()"
                [attacksPerMember]="w.attacksPerMember"
                [inProgress]="w.state !== 'ended'"
              />
            </section>
          }
        }
      </app-load-state>
    </div>
  `,
  styles: `
    .notice {
      display: flex;
      gap: 0.9rem;
      align-items: flex-start;
    }
    .notice mat-icon {
      flex: none;
      color: var(--cn-gold);
    }
    .notice h2 {
      margin-bottom: 0.25rem;
    }
    .notice p {
      margin: 0;
    }
  `,
})
export class WarDetailPage {
  private readonly wars = inject(WarService);

  /** Route parameter `:id` (bound automatically by the router). */
  readonly id = input.required<string>();

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.wars.getWar(params),
  });
  protected readonly war = computed(() => (this.resource.hasValue() ? this.resource.value() : null));
  protected readonly rows = computed(() => {
    const w = this.war();
    return w ? participantRows(w) : [];
  });
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w?.hasDetails ? computeWarKpi(w) : null;
  });
}
