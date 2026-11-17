import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import {
  CwlExclusion,
  CwlScoreBreakdown,
  CwlSelectionPlayer,
  CwlSelectionStatus,
} from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { CwlSelectionService } from '../../core/backend/cwl-selection.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { SISTER_CLANS } from '../../core/config/sister-clans';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { ClanRole } from '../../core/models';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { StarText } from '../../shared/components/star-text';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { Table } from '../../shared/table/table';
import { TableFilters } from '../../shared/table/table-filters';
import { CommendationMedal } from '../../shared/game/commendation-medal';
import { Icon } from '../../shared/icon/icon';
import { roleKey } from '../../shared/labels';
import { ExcludePlayerDialog, ExcludePlayerDialogData } from './components/exclude-player-dialog';
import { TownHallIcon } from '../../shared/game/town-hall-icon';

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
/** Roles in the line-up, in the order of the status filter. */
const STATUSES: readonly CwlSelectionStatus[] = [
  'starter',
  'reserve',
  'bench',
  'ineligible',
  'excluded',
];
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
 * line-up (administrators, leaders and co-leaders): always
 * sorted from the best, the 15 starters glow blue and the 3 reserves green. The backend computes
 * the scores; the page explains the rules. Administrators can exclude players, who stay in the
 * ranking marked as excluded.
 */
@Component({
  selector: 'crn-cwl-selection-page',
  imports: [
    Table,
    TranslatePipe,
    RouterLink,
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './cwl-selection-page.html',
  styleUrl: './cwl-selection-page.scss',
})
export class CwlSelectionPage {
  private readonly service = inject(CwlSelectionService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);
  private readonly auth = inject(AuthService);
  protected readonly isMine = this.auth.isMyPlayer;
  /** Only administrators exclude players (always with mock data, for the demo). */
  private readonly config = inject(APP_CONFIG);
  private readonly useMock = this.config.useMockApi;
  protected readonly canExclude = computed(() => this.useMock || this.auth.isAdmin());

  protected readonly resource = rxResource({ stream: () => this.service.get() });
  protected readonly selection = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
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
  /** Tag of the player whose exclusion is being removed. */
  protected readonly readmitting = signal<string | null>(null);

  protected readonly barParts = BAR_PARTS;
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

  /** Filters of the ranking; the clans offered are the ones of the Crusade. */
  protected readonly filters = computed<TableFilters<CwlSelectionPlayer>>(() => ({
    townHall: { type: 'number', value: (p) => p.townHallLevel },
    name: {
      type: 'text',
      value: (p) => [p.name, p.tag, this.clanName(p.clanTag)],
      placeholder: 'cwlSelection.searchPlaceholder',
    },
    status: {
      type: 'select',
      options: STATUSES.map((s) => ({ value: s, label: `cwlSelection.statuses.${s}` })),
    },
    score: { type: 'number' },
    cwl: { type: 'boolean', value: (p) => p.cwl !== null },
    war: { type: 'number', value: (p) => (p.war.wars ? p.war.averageStarsPerAttack : null) },
    heroes: { type: 'number', value: (p) => p.heroes?.levels },
  }));

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

  /** Names of the clans of the Crusade: the clan of each player and of their last CWL. */
  private readonly clanNames = new Map<string, string>([
    [this.config.clanTag, this.config.clanName],
    ...SISTER_CLANS.map((c) => [c.tag, c.name] as [string, string]),
  ]);

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

  /** Tooltip of the "excluded" label: reason, who and when. */
  protected exclusionText(exclusion: CwlExclusion): string {
    const by = this.language.t('cwlSelection.excludedBy', { name: exclusion.excludedBy });
    return exclusion.reason ? `${exclusion.reason}\n${by}` : by;
  }

  protected open(row: CwlSelectionPlayer): void {
    void this.router.navigate(['/players', row.tag]);
  }

  protected exclude(row: CwlSelectionPlayer): void {
    this.dialog
      .open<ExcludePlayerDialog, ExcludePlayerDialogData, CwlExclusion>(ExcludePlayerDialog, {
        width: '30rem',
        maxWidth: 'calc(100vw - 2rem)',
        data: { tag: row.tag, name: row.name, reason: row.exclusion?.reason ?? null },
      })
      .afterClosed()
      .subscribe((exclusion) => {
        if (!exclusion) return;
        this.resource.reload();
        this.notify('SUCCESS.PLAYER_EXCLUDED');
      });
  }

  protected readmit(row: CwlSelectionPlayer): void {
    if (this.readmitting()) return;
    this.readmitting.set(row.tag);
    this.service.readmit(row.tag).subscribe({
      next: () => {
        this.readmitting.set(null);
        this.resource.reload();
        this.notify('SUCCESS.PLAYER_READMITTED');
      },
      error: (error: unknown) => {
        this.readmitting.set(null);
        const { fields, general } = backendErrors(error);
        const [first] = [...general, ...fields];
        if (first)
          this.snackBar.open(this.language.t(first.key, first.params), undefined, {
            duration: 4000,
          });
      },
    });
  }

  private notify(messageKey: string): void {
    this.snackBar.open(this.language.t(messageKey), undefined, { duration: 3000 });
  }
}
