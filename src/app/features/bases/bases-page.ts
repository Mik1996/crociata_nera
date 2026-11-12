import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
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
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { BaseDeleteDialog, BaseDeleteDialogData } from './components/base-delete-dialog';
import { BaseFormDialog, BaseFormDialogData } from './components/base-form-dialog';
import { BaseImageDialog, BaseImageDialogData } from './components/base-image-dialog';
import { ClanCastleTroops } from './components/clan-castle-troops';

const FORM_DIALOG = {
  width: '36rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/**
 * Arsenal of defense bases: screenshot, in-game "copy base" link and notes, filtered by town hall
 * (`?th=18`). Members of the clans read it; administrators add, edit and delete bases.
 */
@Component({
  selector: 'app-bases-page',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
    TranslatePipe,
    LoadState,
    PageHeader,
    ScrollFade,
    ClanCastleTroops,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './bases-page.html',
  styleUrl: './bases-page.scss',
})
export class BasesPage {
  private readonly service = inject(DefenseBasesService);
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

  protected readonly bases = rxResource({
    params: () => ({ townHall: this.townHall() }),
    stream: ({ params }) => this.service.list(params.townHall),
  });
  protected readonly items = computed(() => (this.bases.hasValue() ? this.bases.value().items : []));
  /** Levels offered by the filter; the selected one stays even when it has no bases left. */
  protected readonly levels = computed(() => {
    const levels = this.bases.hasValue() ? this.bases.value().townHallLevels : [];
    const selected = this.townHall();
    return selected && !levels.includes(selected)
      ? [...levels, selected].sort((a, b) => b - a)
      : levels;
  });

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
      .subscribe((deleted) => deleted && this.changed('SUCCESS.BASE_DELETED'));
  }

  private openForm(data: BaseFormDialogData): void {
    this.dialog
      .open<BaseFormDialog, BaseFormDialogData, DefenseBase>(BaseFormDialog, {
        ...FORM_DIALOG,
        data,
      })
      .afterClosed()
      .subscribe(
        (saved) => saved && this.changed(data.base ? 'SUCCESS.BASE_UPDATED' : 'SUCCESS.BASE_CREATED'),
      );
  }

  /** Reloads the list (the backend sorts and lists the levels) and says what happened. */
  private changed(messageKey: string): void {
    this.bases.reload();
    this.snackBar.open(this.language.t(messageKey), undefined, { duration: 3000 });
  }
}
