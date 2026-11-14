import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { Icon } from '../../shared/icon/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { DefenseBase } from '../../core/backend/backend-api.types';
import { BaseImageVariant, DefenseBasesService } from '../../core/backend/defense-bases.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { TOWN_HALL_IMAGES } from '../../core/game/game-assets';
import { LanguageService } from '../../core/i18n/language.service';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { NearEnd } from '../../shared/directives/near-end';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { BaseArsenal } from './base-arsenal';
import { BaseDeleteDialog, BaseDeleteDialogData } from './components/base-delete-dialog';
import { BaseFormDialog, BaseFormDialogData } from './components/base-form-dialog';
import { BaseImageDialog, BaseImageDialogData } from './components/base-image-dialog';
import { ClanCastleTroops } from './components/clan-castle-troops';

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
 * (`?th=18`) and grouped by town hall when not filtered. Endless list: the next page is asked for
 * when the end of the list comes near; pages already read stay in {@link BaseArsenal}. Members of
 * the clans read it; administrators add, edit and delete bases.
 */
@Component({
  selector: 'crn-bases-page',
  imports: [
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
  private readonly useMock = inject(APP_CONFIG).useMockApi;

  /** Administrators only (and everybody in the demo with mock data, which has no sign-in). */
  protected readonly canEdit = computed(() => this.useMock || this.auth.isAdmin());

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
    // First page of a filter, then one more each time the end of the list comes near (also right
    // after a page too short to fill the screen). A feed never asks for a page twice, nor after
    // the last one.
    effect(() => {
      const feed = this.feed();
      const wanted = !feed.items().length || !!this.end()?.visible();
      if (wanted && !feed.loading() && !feed.complete() && feed.error() === undefined) {
        untracked(() => feed.loadMore());
      }
    });
  }

  protected townHallImage(level: number): string | null {
    return TOWN_HALL_IMAGES[level] ?? null;
  }

  protected imageUrl(base: DefenseBase, variant: BaseImageVariant): string {
    return this.service.imageUrl(base, variant);
  }

  protected selectTownHall(level: number | null | undefined): void {
    void this.router.navigate([], {
      queryParams: { th: level ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected openCreate(): void {
    this.openForm({});
  }

  protected openEdit(base: DefenseBase): void {
    this.openForm({ base, imageUrl: this.imageUrl(base, 'full') });
  }

  protected openImage(base: DefenseBase): void {
    this.dialog.open<BaseImageDialog, BaseImageDialogData>(BaseImageDialog, {
      width: '75rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: 'dialog',
      data: { base, imageUrl: this.imageUrl(base, 'full') },
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

  private notify(messageKey: string): void {
    this.snackBar.open(this.language.t(messageKey), undefined, { duration: 3000 });
  }
}
