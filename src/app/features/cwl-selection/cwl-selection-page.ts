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
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { ClanRole } from '../../core/models';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { StarText } from '../../shared/components/star-text';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TABLE_WRAP } from '../../shared/directives/table-wrap';
import { CommendationMedal } from '../../shared/game/commendation-medal';
import { Icon } from '../../shared/icon/icon';
import { roleKey } from '../../shared/labels';
import { ExcludePlayerDialog, ExcludePlayerDialogData } from './components/exclude-player-dialog';

/** Roles as returned by the Clash of Clans API (`admin` is the elder). */
const ROLES: Record<string, ClanRole> = {
  leader: 'leader',
  coLeader: 'coLeader',
  admin: 'elder',
  member: 'member',
};

/** Tier medals of `cwlStriker`, best first: count field and medal of each. */
const STRIKER_TIERS = [
  { tier: 'gold', emblem: 'cwlStriker-gold' },
  { tier: 'silver', emblem: 'cwlStriker-silver' },
  { tier: 'bronze', emblem: 'cwlStriker-bronze' },
] as const;

/** Parts of the score, in the order of the explanation; the first five fill the score bar. */
const BREAKDOWN_PARTS: readonly (keyof CwlScoreBreakdown)[] = [
  'cwlCommendations',
  'cwlPerformance',
  'war',
  'heroes',
  'townHall',
  'missedAttacks',
  'activity',
];
const BAR_PARTS = BREAKDOWN_PARTS.slice(0, 5);

/**
 * Ranking of the clan members for the CWL line-up (administrators, leaders and co-leaders): always
 * sorted from the best, the 15 starters glow blue and the 3 reserves green. The backend computes
 * the scores; the page explains the rules. Administrators can exclude players, who stay in the
 * ranking marked as excluded.
 */
@Component({
  selector: 'crn-cwl-selection-page',
  imports: [
    TABLE_WRAP,
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
  private readonly useMock = inject(APP_CONFIG).useMockApi;
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

  protected readonly strikerTiers = STRIKER_TIERS;
  protected readonly barParts = BAR_PARTS;
  private readonly baseColumns = [
    'rank',
    'name',
    'status',
    'townHall',
    'score',
    'cwl',
    'war',
    'heroes',
  ];
  protected readonly columns = computed(() =>
    this.canExclude() ? [...this.baseColumns, 'actions'] : this.baseColumns,
  );

  /** CWL seasons considered, as short month names (`ott 2026`). */
  protected readonly seasonLabels = computed(() => {
    const format = new Intl.DateTimeFormat(this.language.current(), {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return (this.selection()?.seasons ?? []).map((season) =>
      format.format(new Date(`${season}-01`)),
    );
  });

  protected roleLabel(role: string | null): string | null {
    const clanRole = role ? ROLES[role] : undefined;
    return clanRole ? roleKey(clanRole) : null;
  }

  /** The parts of the score, one per line (tooltip of the score). */
  protected breakdownText(row: CwlSelectionPlayer): string {
    const number = new Intl.NumberFormat(this.language.current(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    });
    return BREAKDOWN_PARTS.filter((part) => part !== 'missedAttacks' || row.breakdown[part] !== 0)
      .filter((part) => part !== 'activity' || row.breakdown[part] !== 0)
      .map(
        (part) =>
          `${this.language.t(`cwlSelection.parts.${part}`)}: ${number.format(row.breakdown[part])}`,
      )
      .join('\n');
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
