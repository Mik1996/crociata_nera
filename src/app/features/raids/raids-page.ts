import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CocApiService } from '../../core/api/coc-api';
import { AuthService } from '../../core/backend/auth.service';
import { capitalHallImage } from '../../core/game/clan-assets';
import { GAME_ICONS } from '../../core/game/game-assets';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { RaidMember, RaidSeason } from '../../core/models';
import { Icon } from '../../shared/components/icon/icon';
import { KpiCard } from '../../shared/components/kpi-card/kpi-card';
import { LoadState } from '../../shared/components/load-state/load-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PdfButton } from '../../shared/components/pdf-button/pdf-button';
import { PlayerCell } from '../../shared/components/player-cell/player-cell';
import { Select, SelectOption } from '../../shared/components/select/select';
import { RAID_MEMBER_FILTERS } from '../../shared/components/table/clan-tables';
import { serverTable } from '../../shared/components/table/server-table';
import { Table } from '../../shared/components/table/table';
import { Tag } from '../../shared/components/tag/tag';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TablePdf } from '../../shared/pdf/table-pdf';
import { raidMembersPdf } from './raid-members-pdf';

const MAXIMUM_CAPITAL_RAIDS = 6;
/**
 * Raid Weekends of the Clan Capital: totals of the weekend, Capital Gold and attacks of every
 * member, and the current members who did not take part (capital raids are mandatory).
 */
@Component({
  selector: 'crn-raids-page',
  imports: [
    Table,
    TranslatePipe,
    LocalNumberPipe,
    RouterLink,
    Icon,
    MatTableModule,
    PageHeader,
    LoadState,
    KpiCard,
    ScrollFade,
    Tag,
    Select,
    PlayerCell,
    PdfButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './raids-page.html',
  styleUrl: './raids-page.scss',
})
export class RaidsPage {
  private readonly api = inject(CocApiService);
  private readonly language = inject(LanguageService);
  protected readonly isMine = inject(AuthService).isMyPlayer;

  protected readonly raids = rxResource({ stream: () => this.api.getRaidSeasons() });
  private readonly clan = rxResource({ stream: () => this.api.getClan() });

  protected readonly weekends = computed(() => (this.raids.hasValue() ? this.raids.value() : []));
  protected readonly weekendOptions = computed<SelectOption<string>[]>(() =>
    this.weekends().map((w) => ({
      value: w.id,
      label: `${this.label(w)} · ${this.language.t('raids.state.' + w.state)}`,
    })),
  );
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

  protected readonly raidsCompleted = computed(() => {
    const weekend = this.weekend();
    return (
      weekend?.attackLog.reduce(
        (sum, log) => sum + (log.districtCount === log.districtsDestroyed ? 1 : 0),
        0,
      ) ?? 0
    );
  });

  /** Capital Peak at the clan's Capital Hall level (the castle icon until the clan loads). */
  protected readonly capitalPeakImage = computed(() =>
    this.clan.hasValue() ? capitalHallImage(this.clan.value().capitalHallLevel) : null,
  );

  protected readonly GAME_ICONS = GAME_ICONS;

  protected readonly columns = ['rank', 'name', 'attacks', 'looted'];
  protected readonly filters = RAID_MEMBER_FILTERS;
  /** Members who attacked in the weekend, filtered and paged by the backend, with their totals. */
  protected readonly members = serverTable({
    params: () => {
      const weekend = this.weekend();
      return weekend?.hasMembers ? weekend.id : undefined;
    },
    load: (query, weekend) => this.api.getRaidMembersTable(weekend, query),
  });

  protected readonly MAXIMUM_CAPITAL_RAIDS = MAXIMUM_CAPITAL_RAIDS;

  /** Who attacked in the chosen weekend as a PDF (`null` without the members' detail). */
  protected readonly membersPdf = computed<TablePdf<RaidMember> | null>(() => {
    const weekend = this.weekend();
    if (!weekend?.hasMembers) return null;
    return raidMembersPdf(weekend, {
      t: (key, params) => this.language.t(key, params),
      locale: this.language.current(),
      weekendLabel: this.fullLabel(weekend),
    });
  });

  /** "6 – 9 nov", in the current language. */
  protected label(weekend: RaidSeason): string {
    const day = new Intl.DateTimeFormat(this.language.current(), {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Rome',
    });
    return `${day.format(new Date(weekend.startTime))} – ${day.format(new Date(weekend.endTime))}`;
  }

  /** "6 nov – 9 nov 2026" (with the year, for the PDF), in the current language. */
  private fullLabel(weekend: RaidSeason): string {
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Rome',
    };
    const locale = this.language.current();
    const start = new Intl.DateTimeFormat(locale, options).format(new Date(weekend.startTime));
    const end = new Intl.DateTimeFormat(locale, { ...options, year: 'numeric' }).format(
      new Date(weekend.endTime),
    );
    return `${start} – ${end}`;
  }

  protected changeWeekend(id: string): void {
    this.chosen.set(id);
  }
}
