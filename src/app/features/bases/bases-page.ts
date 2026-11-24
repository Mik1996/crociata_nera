import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { AuthService } from '../../core/backend/auth.service';
import { BaseProposal, DefenseBase } from '../../core/backend/backend-api.types';
import { BaseImageVariant, DefenseBasesService } from '../../core/backend/defense-bases.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { townHallImage } from '../../core/game/units';
import { LanguageService } from '../../core/i18n/language.service';
import { Icon } from '../../shared/components/icon/icon';
import { LoadState } from '../../shared/components/load-state/load-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { NearEnd } from '../../shared/directives/near-end';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { BaseArsenal } from './base-arsenal';
import { BaseDeleteDialog, BaseDeleteDialogData } from './components/base-delete-dialog';
import { BaseFormDialog, BaseFormDialogData } from './components/base-form-dialog';
import {
  BASE_IMAGE_DIALOG,
  BaseImageDialog,
  BaseImageDialogData,
} from './components/base-image-dialog';
import { BasesPdfEditor } from './components/bases-pdf-editor';
import { ClanCastleTroops } from './components/clan-castle-troops';
import { MyProposals } from './components/my-proposals';

const FORM_DIALOG = {
  width: '36rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/** Bases of one town hall level, in the order of the arsenal. */
export interface TownHallGroup {
  level: number;
  bases: DefenseBase[];
}

/**
 * Arsenal of defense bases: screenshot, in-game "copy base" link and notes, filtered by town hall
 * (`?th=18`) and grouped by town hall in sections that expand and collapse when not filtered.
 * Opened without a filter, it selects the highest town hall among the user's linked accounts. Endless list: the next page is asked for
 * when the end of the list comes near; pages already read stay in {@link BaseArsenal}. Members of
 * the clans read it and propose bases, which wait for an administrator's approval ("My proposals",
 * above the arsenal); administrators add (published at once), edit and delete bases.
 */
@Component({
  selector: 'crn-bases-page',
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatChipsModule,
    Icon,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
    LoadState,
    PageHeader,
    ScrollFade,
    NearEnd,
    ClanCastleTroops,
    MyProposals,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './bases-page.html',
  styleUrl: './bases-page.scss',
})
export class BasesPage {
  private readonly service = inject(DefenseBasesService);
  private readonly arsenal = inject(BaseArsenal);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly api = inject(CocApiService);
  private readonly useMock = inject(APP_CONFIG).useMockApi;

  /**
   * Editing the arsenal and making its PDF: administrators only (and everybody in the demo with
   * mock data, which has no sign-in).
   */
  protected readonly canEdit = computed(() => this.useMock || this.auth.isAdmin());
  /**
   * Proposing bases and "My proposals": signed-in members who are not administrators (whose bases
   * need no approval). The page is only reached with access to the clans' data. Shown in the demo
   * with mock data too.
   */
  protected readonly canPropose = computed(
    () => this.useMock || (!!this.auth.user() && !this.auth.isAdmin()),
  );
  /** "My proposals" is expanded (collapsed at first). */
  protected readonly proposalsOpen = signal(false);
  private readonly myProposals = viewChild(MyProposals);

  /** `?th=18`, bound by the router. */
  readonly th = input<string>();
  protected readonly townHall = computed(() => {
    const level = Number(this.th());
    return Number.isInteger(level) && level > 0 ? level : null;
  });

  /** Pages read so far for the filter (kept when the filter or the page is left and shown again). */
  protected readonly feed = computed(() => this.arsenal.feed(this.townHall()));
  protected readonly items = computed(() => this.feed().items());
  /** Consecutive bases of the same town hall (the backend sorts by town hall first). */
  protected readonly groups = computed(() => {
    const groups: TownHallGroup[] = [];
    for (const base of this.items()) {
      const last = groups.at(-1);
      if (last?.level === base.townHallLevel) last.bases.push(base);
      else groups.push({ level: base.townHallLevel, bases: [base] });
    }
    return groups;
  });
  /** Town hall sections the user collapsed (all expanded at first). */
  protected readonly collapsed = signal<ReadonlySet<number>>(new Set());

  /**
   * The linked accounts in a clan of the Crusade, with their town hall: read only to pick the
   * default filter (no request without linked accounts).
   */
  private readonly memberships = rxResource({
    params: () => {
      const tags = this.auth.linkedPlayers().map((p) => p.tag);
      return tags.length ? tags : undefined;
    },
    stream: () => this.api.getMemberships().pipe(catchError(() => of([]))),
  });
  /**
   * The default filter has been decided (or was not needed: a filter in the address, no linked
   * accounts, a choice of the user). No page is asked for before, so the arsenal is not read
   * twice.
   */
  private readonly defaultDecided = signal(false);
  private defaultRequested = false;

  /** Marker after the last base: near the visible part, the next page is asked for. */
  private readonly end = viewChild(NearEnd);

  /** Levels offered by the filter; the selected one stays even when it has no bases left. */
  protected readonly levels = computed(() => {
    const levels = this.feed().townHallLevels();
    const selected = this.townHall();
    return selected && !levels.includes(selected)
      ? [...levels, selected].sort((a, b) => b - a)
      : levels;
  });

  constructor() {
    // Opened without a filter: the highest town hall among the user's accounts, once.
    effect(() => {
      if (this.defaultDecided() || this.defaultRequested) return;
      if (this.th() !== undefined || !this.auth.linkedPlayers().length) {
        this.defaultDecided.set(true);
        return;
      }
      if (this.memberships.isLoading()) return;
      const levels = (this.memberships.value() ?? [])
        .map((m) => m.townHallLevel)
        .filter((level): level is number => level !== null && level > 0);
      if (!levels.length) {
        this.defaultDecided.set(true);
        return;
      }
      this.defaultRequested = true;
      untracked(() => this.selectTownHall(Math.max(...levels)));
    });

    // First page of a filter, then one more each time the end of the list comes near (also right
    // after a page too short to fill the screen). A feed never asks for a page twice, nor after
    // the last one.
    effect(() => {
      if (!this.defaultDecided()) return;
      const feed = this.feed();
      const wanted = !feed.items().length || !!this.end()?.visible();
      if (wanted && !feed.loading() && !feed.complete() && feed.error() === undefined) {
        untracked(() => feed.loadMore());
      }
    });
  }

  protected townHallImage(level: number): string | null {
    return townHallImage(level) ?? null;
  }

  protected imageUrl(base: DefenseBase, variant: BaseImageVariant): string {
    return this.service.imageUrl(base, variant);
  }

  protected selectTownHall(level: number | null | undefined): void {
    void this.router
      .navigate([], {
        queryParams: { th: level ?? null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .finally(() => this.defaultDecided.set(true));
  }

  /** Types the bases handed to the grid template. */
  protected asBases(bases: DefenseBase[]): DefenseBase[] {
    return bases;
  }

  protected onGroupToggle(level: number, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open !== this.collapsed().has(level)) return;
    this.collapsed.update((levels) => {
      const next = new Set(levels);
      if (open) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  protected openCreate(): void {
    this.openForm({});
  }

  protected openEdit(base: DefenseBase): void {
    this.openForm({ base, imageUrl: this.imageUrl(base, 'full') });
  }

  /** The editor of the bases PDF, as large as the screen: it lists the whole arsenal. */
  /** A member proposes a new base (sent for review). */
  protected openPropose(): void {
    this.openProposalForm({ proposal: true }, 'SUCCESS.BASE_PROPOSED');
  }

  /** The author changes a proposal; a rejected one is sent again for review. */
  protected openEditProposal(proposal: BaseProposal): void {
    this.openProposalForm(
      { base: proposal, imageUrl: this.imageUrl(proposal, 'full'), proposal: true },
      proposal.status === 'REJECTED'
        ? 'SUCCESS.BASE_PROPOSAL_RESUBMITTED'
        : 'SUCCESS.BASE_PROPOSAL_UPDATED',
    );
  }

  protected openWithdraw(proposal: BaseProposal): void {
    this.dialog
      .open<BaseDeleteDialog, BaseDeleteDialogData, boolean>(BaseDeleteDialog, {
        ...FORM_DIALOG,
        width: '28rem',
        data: { base: proposal, imageUrl: this.imageUrl(proposal, 'thumb'), withdraw: true },
      })
      .afterClosed()
      .subscribe((withdrawn) => {
        if (!withdrawn) return;
        this.myProposals()?.reload();
        this.notify('SUCCESS.BASE_PROPOSAL_WITHDRAWN');
      });
  }

  protected openPdfEditor(): void {
    this.dialog.open(BasesPdfEditor, {
      width: '80rem',
      maxWidth: 'calc(100vw - 2rem)',
      height: 'calc(100dvh - 2rem)',
      autoFocus: 'first-tabbable',
      // Closed only with its buttons: a click beside it would lose the composition.
      disableClose: true,
    });
  }

  /**
   * The enlarged screenshot; the arrows browse the bases of the list (reading its next pages), or
   * show this one only when it is not in the list (a proposal).
   */
  protected openImage(base: DefenseBase): void {
    const feed = this.feed();
    const index = this.items().findIndex((b) => b.id === base.id);
    this.dialog.open<BaseImageDialog, BaseImageDialogData>(BaseImageDialog, {
      ...BASE_IMAGE_DIALOG,
      data:
        index < 0
          ? { bases: signal([base]), index: 0, imageUrl: (b) => this.imageUrl(b, 'full') }
          : {
              bases: feed.items,
              index,
              imageUrl: (b) => this.imageUrl(b, 'full'),
              loadMore: () => {
                if (!feed.loading() && !feed.complete() && feed.error() === undefined) {
                  feed.loadMore();
                }
              },
            },
    });
  }

  protected openDelete(base: DefenseBase): void {
    this.dialog
      .open<BaseDeleteDialog, BaseDeleteDialogData, boolean>(BaseDeleteDialog, {
        ...FORM_DIALOG,
        width: '28rem',
        data: { base, imageUrl: this.imageUrl(base, 'thumb') },
      })
      .afterClosed()
      .subscribe((deleted) => {
        if (!deleted) return;
        this.arsenal.reset();
        this.notify('SUCCESS.BASE_DELETED');
      });
  }

  private openForm(data: BaseFormDialogData): void {
    this.dialog
      .open<BaseFormDialog, BaseFormDialogData, DefenseBase>(BaseFormDialog, {
        ...FORM_DIALOG,
        data,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        // An edited base is updated where it is shown; a new one needs the pages read again (the
        // backend sorts them and lists the levels).
        if (data.base) this.arsenal.replace(saved);
        else this.arsenal.reset();
        this.notify(data.base ? 'SUCCESS.BASE_UPDATED' : 'SUCCESS.BASE_CREATED');
      });
  }

  /**
   * The form of a proposal: once sent, "My proposals" is read again and expanded, so the member
   * sees it waiting for approval. The arsenal does not change.
   */
  private openProposalForm(data: BaseFormDialogData, messageKey: string): void {
    this.dialog
      .open<BaseFormDialog, BaseFormDialogData, DefenseBase>(BaseFormDialog, {
        ...FORM_DIALOG,
        data,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.myProposals()?.reload();
        this.proposalsOpen.set(true);
        this.notify(messageKey, 6000);
      });
  }

  private notify(messageKey: string, duration = 3000): void {
    this.snackBar.open(this.language.t(messageKey), undefined, { duration });
  }
}
