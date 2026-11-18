import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { BackendMessage, DefenseBase } from '../../../core/backend/backend-api.types';
import { DefenseBasesService } from '../../../core/backend/defense-bases.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import {
  ClanCastleTroop,
  clanCastleCapacity,
  housingSpaceUsed,
  troopInfo,
} from '../../../core/game/clan-castle';
import { townHallImage } from '../../../core/game/units';
import { LanguageService } from '../../../core/i18n/language.service';
import { ACCEPTED_IMAGE_TYPES, MAX_SOURCE_BYTES } from '../../../core/utils/prepare-image';
import { FormErrors } from '../../../shared/components/form-errors/form-errors';
import { Icon } from '../../../shared/components/icon/icon';
import { ScrollFade } from '../../../shared/directives/scroll-fade';
import { BaseArsenal } from '../base-arsenal';
import { BasesPdf, BasesPdfPage } from '../pdf/bases-pdf';
import { BasesPdfExporter } from '../pdf/bases-pdf-exporter';
import { ClanCastlePicker } from './clan-castle-picker';

/** Longest title of the cover. */
export const MAX_PDF_TITLE_LENGTH = 80;
/** Longest description of a page (as long as the description of a base). */
export const MAX_PDF_DESCRIPTION_LENGTH = 1000;

/**
 * A page of the PDF being composed: a base with its description and clan castle reinforcements,
 * changed for the PDF only (the base's own, to start with).
 */
export interface DraftPage {
  /** Unique in the draft, for `track`. */
  key: number;
  base: DefenseBase;
  description: string;
  troops: ClanCastleTroop[];
}

/** A page as the list shows it: the reinforcements with their pictures and the castle space. */
interface PageRow extends DraftPage {
  icons: { name: string; count: number; icon: string | undefined }[];
  used: number;
  capacity: number;
}

/**
 * "Create bases PDF" editor: the cover (title and picture, which stays on the device) and the pages,
 * one per base, picked from the whole arsenal, reordered by dragging (or with the arrows) and given a
 * description and clan castle reinforcements for the PDF only (the base's own, to start with). "Create PDF" downloads the file and
 * leaves the editor open, so the PDF can be changed and made again. For leaders and administrators.
 */
@Component({
  selector: 'crn-bases-pdf-editor',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    TranslatePipe,
    Icon,
    FormErrors,
    ScrollFade,
    ClanCastlePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bases-pdf-editor.html',
  styleUrl: './bases-pdf-editor.scss',
})
export class BasesPdfEditor {
  private readonly arsenal = inject(BaseArsenal);
  private readonly service = inject(DefenseBasesService);
  private readonly exporter = inject(BasesPdfExporter);
  private readonly language = inject(LanguageService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly accept = ACCEPTED_IMAGE_TYPES.join(',');
  protected readonly clanName = inject(APP_CONFIG).clanName;
  protected readonly maxTitle = MAX_PDF_TITLE_LENGTH;
  protected readonly maxDescription = MAX_PDF_DESCRIPTION_LENGTH;

  protected readonly title = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_PDF_TITLE_LENGTH)],
  });
  private readonly titleValue = toSignal(this.title.valueChanges, { initialValue: '' });

  /** The cover picture: the file (read only when the PDF is made) and its preview URL. */
  protected readonly cover = signal<{ file: Blob; url: string } | null>(null);
  protected readonly coverError = signal<BackendMessage | null>(null);
  protected readonly dragging = signal(false);

  protected readonly pages = signal<DraftPage[]>([]);
  protected readonly rows = computed(() =>
    this.pages().map<PageRow>((page) => ({
      ...page,
      icons: page.troops.map((troop) => ({ ...troop, icon: troopInfo(troop.name)?.icon })),
      used: housingSpaceUsed(page.troops),
      capacity: clanCastleCapacity(page.base.townHallLevel),
    })),
  );
  /** The page whose reinforcements are being changed (one at a time). */
  protected readonly editingTroops = signal<number | null>(null);
  private nextKey = 0;

  protected readonly busy = signal(false);
  /** "Create PDF" was pressed: what is missing is shown. */
  protected readonly attempted = signal(false);

  /** The whole arsenal, read page after page as soon as the editor opens. */
  protected readonly feed = computed(() => this.arsenal.feed(null));
  protected readonly filter = signal<number | null>(null);
  protected readonly levels = computed(() => this.feed().townHallLevels());
  protected readonly shown = computed(() => {
    const level = this.filter();
    const items = this.feed().items();
    return level === null ? items : items.filter((base) => base.townHallLevel === level);
  });
  /** Ids of the bases already in the PDF. */
  protected readonly chosen = computed(() => new Set(this.pages().map((page) => page.base.id)));
  /** Bases of the filter not in the PDF yet ("Add all"). */
  protected readonly addable = computed(() =>
    this.shown().filter((base) => !this.chosen().has(base.id)),
  );

  protected readonly missing = computed(() => {
    this.titleValue();
    const missing: string[] = [];
    if (!this.title.value.trim()) missing.push('bases.pdf.missingTitle');
    if (!this.cover()) missing.push('bases.pdf.missingCover');
    if (!this.pages().length) missing.push('bases.pdf.missingBases');
    return missing;
  });

  constructor() {
    // Every page of the arsenal, one after the other (a few hundred bases at most).
    effect(() => {
      const feed = this.feed();
      if (!feed.loading() && !feed.complete() && feed.error() === undefined) {
        untracked(() => feed.loadMore());
      }
    });
    inject(DestroyRef).onDestroy(() => {
      const cover = this.cover();
      if (cover) URL.revokeObjectURL(cover.url);
    });
  }

  protected townHallImage(level: number): string | null {
    return townHallImage(level) ?? null;
  }

  protected thumb(base: DefenseBase): string {
    return this.service.imageUrl(base, 'thumb');
  }

  // --- Cover ----------------------------------------------------------------------------------

  protected onCoverInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.setCover(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setCover(file);
  }

  protected onPaste(event: ClipboardEvent): void {
    const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    this.setCover(file);
  }

  protected removeCover(): void {
    const cover = this.cover();
    if (cover) URL.revokeObjectURL(cover.url);
    this.cover.set(null);
  }

  private setCover(file: File): void {
    if (!ACCEPTED_IMAGE_TYPES.some((type) => type === file.type)) {
      this.coverError.set({ key: 'ERROR.IMAGE_IS_NOT_VALID' });
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      this.coverError.set({
        key: 'bases.form.imageTooLarge',
        params: { max: MAX_SOURCE_BYTES / 1024 / 1024 },
      });
      return;
    }
    this.coverError.set(null);
    this.removeCover();
    this.cover.set({ file, url: URL.createObjectURL(file) });
  }

  // --- Pages ----------------------------------------------------------------------------------

  /** A base of the arsenal: added at the end of the PDF, or taken out when it is already there. */
  protected toggle(base: DefenseBase): void {
    if (this.chosen().has(base.id)) {
      this.pages.update((pages) => pages.filter((page) => page.base.id !== base.id));
    } else {
      this.pages.update((pages) => [...pages, this.page(base)]);
    }
  }

  protected addAll(): void {
    const added = this.addable().map((base) => this.page(base));
    this.pages.update((pages) => [...pages, ...added]);
  }

  protected clear(): void {
    this.pages.set([]);
  }

  protected remove(page: DraftPage): void {
    this.pages.update((pages) => pages.filter((p) => p.key !== page.key));
  }

  protected move(index: number, by: -1 | 1): void {
    this.pages.update((pages) => {
      const next = [...pages];
      moveItemInArray(next, index, index + by);
      return next;
    });
  }

  protected drop(event: CdkDragDrop<DraftPage[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.pages.update((pages) => {
      const next = [...pages];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
  }

  protected toggleTroops(page: DraftPage): void {
    this.editingTroops.update((key) => (key === page.key ? null : page.key));
  }

  protected setTroops(page: DraftPage, troops: ClanCastleTroop[]): void {
    this.pages.update((pages) => pages.map((p) => (p.key === page.key ? { ...p, troops } : p)));
  }

  protected setDescription(page: DraftPage, event: Event): void {
    const description = (event.target as HTMLTextAreaElement).value;
    this.pages.update((pages) =>
      pages.map((p) => (p.key === page.key ? { ...p, description } : p)),
    );
  }

  private page(base: DefenseBase): DraftPage {
    return {
      key: this.nextKey++,
      base,
      description: base.description,
      troops: base.clanCastleTroops.map((troop) => ({ ...troop })),
    };
  }

  // --- PDF ------------------------------------------------------------------------------------

  protected async create(): Promise<void> {
    this.attempted.set(true);
    this.title.markAsTouched();
    const cover = this.cover();
    if (this.missing().length || !cover || this.busy()) return;
    this.busy.set(true);
    try {
      await this.exporter.download(this.pdf(), cover.file);
      this.snackBar.open(this.language.t('bases.pdf.created'), undefined, { duration: 3000 });
    } catch (error) {
      console.error('[pdf] bases export failed', error);
      this.snackBar.open(this.language.t('pdf.error'), undefined, { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }

  /** The PDF of the draft, every text translated. */
  private pdf(): BasesPdf {
    const t = (key: string, params?: Record<string, unknown>) => this.language.t(key, params);
    const drafts = this.pages();
    const total = drafts.length;
    const levels = drafts.map((page) => page.base.townHallLevel);
    const max = Math.max(...levels);
    const min = Math.min(...levels);
    const range =
      max === min ? t('common.townHallN', { n: max }) : t('bases.pdf.townHallRange', { max, min });
    const pages = drafts.map<BasesPdfPage>(({ base, description, troops }, i) => ({
      townHallLevel: base.townHallLevel,
      townHallImage: townHallImage(base.townHallLevel) ?? null,
      image: this.service.imageUrl(base, 'full'),
      layoutUrl: base.layoutUrl,
      troops: troops.map((troop) => ({
        name: troop.name,
        count: troop.count,
        icon: troopInfo(troop.name)?.icon ?? null,
      })),
      castleSpace: t('bases.castle.space', {
        used: housingSpaceUsed(troops),
        max: clanCastleCapacity(base.townHallLevel),
      }),
      description: description.trim(),
      heading: t('common.townHallN', { n: base.townHallLevel }),
      counter: t('bases.pdf.counter', { n: i + 1, total }),
    }));
    return {
      fileName: `crociata-nera-${t('bases.pdf.fileName')}-${formatDate(new Date(), 'yyyy-MM-dd', 'en-US')}`,
      title: this.title.value.trim(),
      cover: {
        kicker: t('bases.title'),
        summary: `${t('bases.pdf.basesCount', { n: total })}  ·  ${range}`,
      },
      pages,
      labels: {
        castle: t('bases.castle.short'),
        noTroops: t('bases.pdf.noTroops'),
        link: t('bases.pdf.link'),
        scan: t('bases.pdf.scan'),
        description: t('bases.form.description'),
      },
    };
  }
}
