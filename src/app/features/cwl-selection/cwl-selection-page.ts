import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import {
  CWL_LINEUP_SIZES,
  CwlExclusion,
  CwlLineupSize,
  CwlScoreBreakdown,
  CwlSelection,
  CwlSelectionPlayer,
  CwlSelectionStatus,
} from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { CwlSelectionService } from '../../core/backend/cwl-selection.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { LanguageService } from '../../core/i18n/language.service';
import { formatLocalDate, LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { ClanRole } from '../../core/models';
import { periodLabel } from '../../core/utils/monthly-history';
import { Icon } from '../../shared/components/icon/icon';
import { Legend } from '../../shared/components/legend/legend';
import { LegendItem } from '../../shared/components/legend-item/legend-item';
import { LoadState } from '../../shared/components/load-state/load-state';
import { Meter, MeterSegment } from '../../shared/components/meter/meter';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PdfButton } from '../../shared/components/pdf-button/pdf-button';
import { PlayerCell } from '../../shared/components/player-cell/player-cell';
import { Select, SelectOption } from '../../shared/components/select/select';
import { StarText } from '../../shared/components/star-text/star-text';
import { crusadeClanNames, selectionFilters } from '../../shared/components/table/clan-tables';
import { serverTable } from '../../shared/components/table/server-table';
import { Table } from '../../shared/components/table/table';
import { Tag, TagTone } from '../../shared/components/tag/tag';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { CommendationMedal } from '../../shared/game/commendation-medal';
import { TownHallIcon } from '../../shared/game/town-hall-icon';
import { roleKey } from '../../shared/labels';
import { TablePdf } from '../../shared/pdf/table-pdf';
import { ExcludePlayerDialog, ExcludePlayerDialogData } from './components/exclude-player-dialog';
import {
  SelectionDecisionData,
  SelectionDecisionDialog,
} from './components/selection-decision-dialog';
import { cwlLineupPdf } from './cwl-lineup-pdf';

/** Roles as returned by the Clash of Clans API (`admin` is the elder). */
const ROLES: Record<string, ClanRole> = {
  leader: 'leader',
  coLeader: 'coLeader',
  admin: 'elder',
  member: 'member',
};

/** Parts of the score, in the order of the explanation; the first six fill the score bar. */
const BREAKDOWN_PARTS: readonly (keyof CwlScoreBreakdown)[] = [
  'cwlCommendations',
  'cwlPerformance',
  'war',
  'heroes',
  'townHall',
  'league',
  'missedAttacks',
  'activity',
];
const BAR_PARTS = BREAKDOWN_PARTS.slice(0, 6);
/** Colour of each part in the score bar (the tooltip uses the same ones). */
const BAR_COLORS: Partial<Record<keyof CwlScoreBreakdown, string>> = {
  cwlCommendations: 'var(--cn-gold)',
  cwlPerformance: 'var(--cn-gold-dark)',
  war: 'var(--cn-red-mid)',
  heroes: 'var(--cn-chart-series-2)',
  townHall: 'var(--cn-text-muted)',
  league: 'var(--cn-score-league)',
};
/** Parts that come from the last CWL, left out for who was not in its line-up. */
const CWL_PARTS: readonly (keyof CwlScoreBreakdown)[] = ['cwlCommendations', 'cwlPerformance'];
/** Highest points of each part of the bar (the wars depend on the player: `war.maxPoints`). */
const PART_MAX_POINTS: Partial<Record<keyof CwlScoreBreakdown, number>> = {
  cwlCommendations: 12,
  cwlPerformance: 13,
  heroes: 20,
  townHall: 10,
  league: 5,
};

/**
 * Ranking of the members of the clans of the Crusade (Crociata Nera, Rossa and d'Oro) for the CWL
 * line-up, read by every member of the clans (their own accounts highlighted): always
 * sorted from the best, the 15 starters glow blue and the 3 reserves green. The backend computes
 * the scores; the page explains the rules. Administrators and the leader of Crociata Nera can exclude
 * players, who stay in the ranking marked as excluded; leaders and co-leaders also export the line-up.
 * One selection per CWL season: the open one counts down to the sign-ups (first day of its month)
 * until an administrator or the leader of Crociata Nera closes it (or its CWL starts), then its
 * ranking is frozen and the next season opens; the selector shows the closed ones.
 */
/** Colour of the line-up status tags (excluded players get their own, with the reason). */
const STATUS_TONES: Record<CwlSelectionStatus, TagTone> = {
  starter: 'starter',
  reserve: 'reserve',
  bench: 'neutral',
  ineligible: 'neutral',
  excluded: 'danger',
};

@Component({
  selector: 'crn-cwl-selection-page',
  imports: [
    Table,
    TranslatePipe,
    MatButtonModule,
    MatTableModule,
    MatTooltipModule,
    LocalNumberPipe,
    LocalDatePipe,
    PageHeader,
    LoadState,
    ScrollFade,
    StarText,
    CommendationMedal,
    Icon,
    TownHallIcon,
    Tag,
    Meter,
    Legend,
    LegendItem,
    PlayerCell,
    PdfButton,
    Select,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './cwl-selection-page.html',
  styleUrl: './cwl-selection-page.scss',
})
export class CwlSelectionPage {
  private readonly service = inject(CwlSelectionService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);
  private readonly config = inject(APP_CONFIG);
  /** The signed-in user's own accounts, highlighted in the ranking. */
  protected readonly isMine = inject(AuthService).isMyPlayer;

  /** Season picked in the selector; `null`: the open one. */
  private readonly chosenSeason = signal<string | null>(null);
  protected readonly resource = rxResource({
    params: () => ({ season: this.chosenSeason() }),
    stream: ({ params }) => this.service.get(params.season ?? undefined),
  });
  protected readonly selection = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly isOpen = computed(() => this.selection()?.state === 'open');
  /**
   * Every member reads the page; the backend says who may do more (and refuses the others anyway):
   * close, reopen and exclude (administrators and the leader of Crociata Nera), download and share
   * the line-up (administrators, leaders and co-leaders). Everything with mock data (demo).
   */
  protected readonly canManage = computed(() => this.selection()?.permissions.manage ?? false);
  protected readonly canExport = computed(() => this.selection()?.permissions.export ?? false);
  /** Exclusions only in the open selection (a closed one is frozen). */
  protected readonly canExclude = computed(() => this.canManage() && this.isOpen());

  protected readonly seasonLabel = (season: string) => periodLabel(season, this.language.current());
  protected readonly seasonOptions = computed<SelectOption<string>[]>(() =>
    (this.selection()?.seasons ?? []).map((s) => ({
      value: s.season,
      label: `${this.seasonLabel(s.season)} · ${this.language.t('cwlSelection.state.' + s.state)}`,
    })),
  );

  /** Now, every 30 seconds: the countdown to the CWL sign-ups. */
  private readonly now = signal(Date.now());
  /** Time left before the sign-ups of the open selection's CWL; `null` once they opened. */
  protected readonly countdown = computed(() => {
    const selection = this.selection();
    if (!selection || selection.state !== 'open') return null;
    const left = new Date(selection.signupStart).getTime() - this.now();
    if (left <= 0) return null;
    const minutes = Math.floor(left / 60_000);
    return {
      days: Math.floor(minutes / 1440),
      hours: Math.floor((minutes % 1440) / 60),
      minutes: minutes % 60,
    };
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  protected readonly rows = computed(() => this.selection()?.players ?? []);
  protected readonly counts = computed(() => {
    const counts: Record<CwlSelectionStatus, number> = {
      starter: 0,
      reserve: 0,
      bench: 0,
      ineligible: 0,
      excluded: 0,
    };
    for (const row of this.rows()) counts[row.status] += 1;
    return counts;
  });
  /** Players a closed selection's line-up moved by hand from the place the ranking gave them. */
  protected readonly movedByHand = computed(
    () => this.rows().filter((row) => row.automaticStatus).length,
  );
  /** The sizes of the line-up to switch between (`permissions.manage`, open selection only). */
  protected readonly lineupSizes: readonly CwlLineupSize[] = [15, 30];
  protected readonly reservesOf = CWL_LINEUP_SIZES;
  /** The size of the line-up is being changed. */
  protected readonly changingSize = signal(false);
  /** Starters and reserves of the selection shown (15 and 3 until it loads), for the texts. */
  protected readonly lineupSize = computed(() => ({
    starters: this.selection()?.starters ?? 15,
    reserves: this.selection()?.reserves ?? CWL_LINEUP_SIZES[15],
  }));
  /** Tag of the player whose exclusion is being removed. */
  protected readonly readmitting = signal<string | null>(null);

  private readonly baseColumns = [
    'rank',
    'townHall',
    'name',
    'status',
    'score',
    'cwl',
    'war',
    'heroes',
  ];
  protected readonly columns = computed(() =>
    this.canExclude() ? [...this.baseColumns, 'actions'] : this.baseColumns,
  );

  /** Filters of the ranking; the text filter also finds the clan of the player. */
  protected readonly filters = computed(() => selectionFilters((tag) => this.clanName(tag)));

  /** The ranking as a table, filtered and paged by the backend. */
  protected readonly players = serverTable({
    params: () => ({ season: this.chosenSeason() }),
    load: (query, params) => this.service.getPlayersTable(query, params.season ?? undefined),
  });

  /** The last CWL season, as month name (`ott 2026`); `null` if none. */
  protected readonly cwlSeasonLabel = computed(() => {
    const season = this.selection()?.cwlSeason;
    if (!season) return null;
    const label = new Intl.DateTimeFormat(this.language.current(), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${season}-01`));
    // Italian and Spanish month names are lowercase ("novembre 2026"): a label starts capitalised.
    return label.charAt(0).toLocaleUpperCase(this.language.current()) + label.slice(1);
  });

  /** The 15 starters and the 3 reserves as a PDF (`null` until the ranking loads). */
  protected readonly lineupPdf = computed<TablePdf<CwlSelectionPlayer> | null>(() => {
    const selection = this.selection();
    if (!selection) return null;
    return cwlLineupPdf(selection, {
      t: (key, params) => this.language.t(key, params),
      locale: this.language.current(),
      clanName: (tag) => this.clanName(tag),
      roleKey: (role) => this.roleLabel(role),
      cwlSeason: this.cwlSeasonLabel(),
    });
  });

  /** Names of the clans of the Crusade: the clan of each player and of their last CWL. */
  private readonly clanNames = crusadeClanNames({
    tag: this.config.clanTag,
    name: this.config.clanName,
  });

  protected clanName(tag: string): string {
    return this.clanNames.get(tag) ?? tag;
  }

  protected roleLabel(role: string | null): string | null {
    const clanRole = role ? ROLES[role] : undefined;
    return clanRole ? roleKey(clanRole) : null;
  }

  /** The parts of the score, one per line (tooltip of the score). */
  protected breakdownText(row: CwlSelectionPlayer): string {
    const number = new Intl.NumberFormat(this.language.current(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const maxPoints: Partial<Record<keyof CwlScoreBreakdown, number>> = {
      ...PART_MAX_POINTS,
      war: row.war.maxPoints,
    };
    return (
      BREAKDOWN_PARTS
        // Not in the last CWL: its parts are 0 (and its points moved to the wars).
        .filter((part) => row.cwl || !CWL_PARTS.includes(part))
        // Penalties only when there are any.
        .filter((part) => maxPoints[part] !== undefined || row.breakdown[part] !== 0)
        .map((part) => {
          const label = this.language.t(`cwlSelection.parts.${part}`);
          const max = maxPoints[part];
          const total = max === undefined ? '' : ` / ${max}`;
          return `${label}: ${number.format(row.breakdown[part])}${total}`;
        })
        .join('\n')
    );
  }

  /** Tooltip of the "excluded" label: reason, who, and for how long. */
  protected exclusionText(exclusion: CwlExclusion): string {
    const by = this.language.t('cwlSelection.excludedBy', { name: exclusion.excludedBy });
    const lasting = this.language.t(
      exclusion.untilRevoked ? 'cwlSelection.untilRevoked' : 'cwlSelection.thisSeason',
    );
    return [exclusion.reason, by, lasting].filter(Boolean).join('\n');
  }

  /** The day the CWL sign-ups of a season open (`1 dicembre`). */
  protected signupDay(selection: CwlSelection): string {
    return formatLocalDate(selection.signupStart, 'd LLLL', this.language.current());
  }

  protected changeSeason(season: string): void {
    this.chosenSeason.set(season);
  }

  /** Closes the open selection, or opens a closed one again (`canManage`), after a confirmation. */
  protected decide(selection: CwlSelection, action: SelectionDecisionData['action']): void {
    this.dialog
      .open<SelectionDecisionDialog, SelectionDecisionData, CwlSelection>(SelectionDecisionDialog, {
        // Closing shows the line-up to change by hand.
        width: action === 'close' ? '46rem' : '30rem',
        maxWidth: 'calc(100vw - 2rem)',
        data: {
          season: selection.season,
          label: this.seasonLabel(selection.season),
          action,
          players: action === 'close' ? selection.players : undefined,
          starters: selection.starters,
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        // The page stays on the season just closed or opened again.
        this.chosenSeason.set(result.season);
        this.reload();
        this.notify(
          action === 'close' ? 'SUCCESS.CWL_SELECTION_CLOSED' : 'SUCCESS.CWL_SELECTION_REOPENED',
        );
      });
  }

  /** Switches the open selection between 15 starters + 3 reserves and 30 + 5 (`canManage`). */
  protected setLineupSize(selection: CwlSelection, starters: CwlLineupSize): void {
    if (this.changingSize() || selection.starters === starters) return;
    this.changingSize.set(true);
    this.service.setLineupSize(selection.season, starters).subscribe({
      next: () => {
        this.changingSize.set(false);
        this.reload();
        this.snackBar.open(
          this.language.t('SUCCESS.CWL_LINEUP_SIZE_CHANGED', {
            starters,
            reserves: CWL_LINEUP_SIZES[starters],
          }),
          undefined,
          { duration: 3000 },
        );
      },
      error: (error: unknown) => {
        this.changingSize.set(false);
        this.showError(error);
      },
    });
  }

  protected exclude(row: CwlSelectionPlayer): void {
    this.dialog
      .open<ExcludePlayerDialog, ExcludePlayerDialogData, CwlExclusion>(ExcludePlayerDialog, {
        width: '30rem',
        maxWidth: 'calc(100vw - 2rem)',
        data: {
          tag: row.tag,
          name: row.name,
          reason: row.exclusion?.reason ?? null,
          untilRevoked: row.exclusion?.untilRevoked ?? false,
        },
      })
      .afterClosed()
      .subscribe((exclusion) => {
        if (!exclusion) return;
        this.reload();
        this.notify('SUCCESS.PLAYER_EXCLUDED');
      });
  }

  protected readmit(row: CwlSelectionPlayer): void {
    if (this.readmitting()) return;
    this.readmitting.set(row.tag);
    this.service.readmit(row.tag).subscribe({
      next: () => {
        this.readmitting.set(null);
        this.reload();
        this.notify('SUCCESS.PLAYER_READMITTED');
      },
      error: (error: unknown) => {
        this.readmitting.set(null);
        this.showError(error);
      },
    });
  }

  /** The ranking changed (an exclusion): summary and table again. */
  private reload(): void {
    this.resource.reload();
    this.players.reload();
  }

  /** The first error of the backend, in a snack bar. */
  private showError(error: unknown): void {
    const { fields, general } = backendErrors(error);
    const [first] = [...general, ...fields];
    if (first)
      this.snackBar.open(this.language.t(first.key, first.params), undefined, { duration: 4000 });
  }

  private notify(messageKey: string): void {
    this.snackBar.open(this.language.t(messageKey), undefined, { duration: 3000 });
  }

  /** Tooltip of a player moved by hand at the closing: the place the ranking gave. */
  protected movedText(row: CwlSelectionPlayer): string {
    const place = this.language.t(`cwlSelection.statuses.${row.automaticStatus}`);
    return this.language.t('cwlSelection.movedByHand', { place });
  }

  /** Colour of a line-up status tag. */
  protected statusTone(status: CwlSelectionStatus): TagTone {
    return STATUS_TONES[status];
  }

  /** Parts of the score bar, out of 100 (penalties excluded). */
  protected scoreSegments(row: CwlSelectionPlayer): MeterSegment[] {
    return BAR_PARTS.map((part) => ({ value: row.breakdown[part], color: BAR_COLORS[part]! }));
  }
}
