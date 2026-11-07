import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CocApiService } from '../../core/api/coc-api';
import { AuthService } from '../../core/backend/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { RaidSeason } from '../../core/models';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';

/**
 * Raid Weekends of the Clan Capital: totals of the weekend, Capital Gold and attacks of every
 * member, and the current members who did not take part (capital raids are mandatory).
 */
@Component({
  selector: 'app-raids-page',
  imports: [
    TranslatePipe,
    LocalNumberPipe,
    RouterLink,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatTableModule,
    PageHeader,
    LoadState,
    KpiCard,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './raids-page.html',
  styleUrl: './raids-page.scss',
})
export class RaidsPage {
  private readonly api = inject(CocApiService);
  private readonly language = inject(LanguageService);
  protected readonly myTag = inject(AuthService).playerTag;

  protected readonly raids = rxResource({ stream: () => this.api.getRaidSeasons() });
  private readonly clan = rxResource({ stream: () => this.api.getClan() });

  protected readonly weekends = computed(() => (this.raids.hasValue() ? this.raids.value() : []));
  /** Weekend chosen in the selector; the most recent one until the user picks another. */
  private readonly chosen = signal<string | null>(null);
  protected readonly weekend = computed<RaidSeason | null>(
    () => this.weekends().find((w) => w.id === this.chosen()) ?? this.weekends().at(0) ?? null,
  );

  /** Current members with no attack in the weekend. */
  protected readonly absent = computed(() => {
    const weekend = this.weekend();
    if (!weekend?.hasMembers || !this.clan.hasValue()) return [];
    const attacked = new Set(weekend.members.map((m) => m.tag));
    return this.clan.value().members.filter((m) => !attacked.has(m.tag));
  });

  protected readonly columns = ['rank', 'name', 'attacks', 'looted'];

  /** "6 – 9 nov", in the current language. */
  protected label(weekend: RaidSeason): string {
    const day = new Intl.DateTimeFormat(this.language.current(), { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
    return `${day.format(new Date(weekend.startTime))} – ${day.format(new Date(weekend.endTime))}`;
  }

  protected changeWeekend(id: string): void {
    this.chosen.set(id);
  }
}
