import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { WarService } from '../../core/services/war.service';
import { computeWarKpi, participantRows } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { WarParticipantsTable } from './components/war-participants-table';
import { WarSummary } from './components/war-summary';

@Component({
  selector: 'app-current-war-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
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
    <app-page-header [title]="'nav.currentWar' | translate" [subtitle]="'currentWar.subtitle' | translate">
      <button mat-stroked-button type="button" (click)="resource.reload()" [disabled]="resource.isLoading()">
        <mat-icon aria-hidden="true">refresh</mat-icon> {{ 'common.refresh' | translate }}
      </button>
    </app-page-header>

    <div class="page__scroll">
      <app-load-state
        [loading]="resource.isLoading()"
        [error]="resource.error()"
        [empty]="!war()"
        emptyIcon="shield"
        [emptyMessage]="'currentWar.empty' | translate"
        (retry)="resource.reload()"
      >
        @if (war(); as w) {
          <section class="cn-card cn-section" [attr.aria-label]="'common.battleSummary' | translate">
            <app-war-summary [war]="w" />
          </section>

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
                icon="hourglass_empty"
                [label]="'currentWar.withoutAttacks' | translate"
                [value]="k.participantsWithoutAttacks"
                [hint]="'currentWar.outOfParticipants' | translate: { n: w.teamSize }"
              />
            </div>
          }

          <section class="cn-card cn-section" aria-labelledby="participants-title">
            <h2 id="participants-title">{{ 'currentWar.participants' | translate }}</h2>
            <app-war-participants-table
              [rows]="rows()"
              [attacksPerMember]="w.attacksPerMember"
              [inProgress]="w.state !== 'ended'"
            />
          </section>
        }
      </app-load-state>
    </div>
  `,
})
export class CurrentWarPage {
  private readonly wars = inject(WarService);

  protected readonly resource = rxResource({ stream: () => this.wars.getCurrentWar() });
  protected readonly war = computed(() => (this.resource.hasValue() ? this.resource.value() : null));
  protected readonly rows = computed(() => {
    const w = this.war();
    return w ? participantRows(w) : [];
  });
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w ? computeWarKpi(w) : null;
  });
}
