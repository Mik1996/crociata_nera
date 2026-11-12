import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import {
  BackendMessage,
  DefenseBase,
  DefenseBaseChanges,
} from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { DefenseBasesService } from '../../../core/backend/defense-bases.service';
import { TOWN_HALL_IMAGES } from '../../../core/game/game-assets';
import { layoutLinkTownHall } from '../../../core/game/layout-link';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_SOURCE_BYTES,
  prepareImage,
} from '../../../core/utils/prepare-image';

export interface BaseFormDialogData {
  /** The base to edit; absent to create a new one. */
  base?: DefenseBase;
  /** Current image of the base being edited. */
  imageUrl?: string;
}

/** Longest description accepted by the backend. */
export const MAX_DESCRIPTION_LENGTH = 1000;

/** The in-game "copy base" link of a home village base (an empty field is left to `required`). */
export function layoutLinkValidator(control: AbstractControl<string | null>): ValidationErrors | null {
  const value = control.value?.trim();
  return !value || layoutLinkTownHall(value) ? null : { layoutLink: true };
}

/**
 * Creates or edits a defense base: in-game link (the town hall level is read from it), screenshot
 * (dropped, pasted or chosen; shrunk in the browser before the upload) and optional description.
 * Prefilled when editing, where only the changed fields are sent. Closes with the saved base.
 */
@Component({
  selector: 'app-base-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './base-form-dialog.html',
  styleUrl: './base-form-dialog.scss',
})
export class BaseFormDialog {
  protected readonly data = inject<BaseFormDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BaseFormDialog, DefenseBase>>(MatDialogRef);
  private readonly service = inject(DefenseBasesService);

  protected readonly editing = !!this.data.base;
  protected readonly accept = ACCEPTED_IMAGE_TYPES.join(',');
  protected readonly maxDescription = MAX_DESCRIPTION_LENGTH;

  protected readonly form = new FormGroup({
    layoutUrl: new FormControl(this.data.base?.layoutUrl ?? '', {
      nonNullable: true,
      validators: [Validators.required, layoutLinkValidator],
    }),
    description: new FormControl(this.data.base?.description ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_DESCRIPTION_LENGTH)],
    }),
  });

  private readonly layoutUrl = toSignal(this.form.controls.layoutUrl.valueChanges, {
    initialValue: this.form.controls.layoutUrl.value,
  });
  protected readonly descriptionText = toSignal(
    this.form.controls.description.valueChanges,
    { initialValue: this.form.controls.description.value },
  );
  /** Town hall level read from the link as it is typed. */
  protected readonly townHall = computed(() => layoutLinkTownHall(this.layoutUrl()));
  protected readonly townHallImage = computed(() => {
    const level = this.townHall();
    return level ? (TOWN_HALL_IMAGES[level] ?? null) : null;
  });

  /** New image, already shrunk; `null` while the current one (if editing) is kept. */
  private readonly image = signal<Blob | null>(null);
  protected readonly preview = signal<string | null>(this.data.imageUrl ?? null);
  /** Object URL of the new image's preview, released when replaced or on close. */
  private previewObjectUrl: string | null = null;
  protected readonly imageError = signal<BackendMessage | null>(null);
  protected readonly preparing = signal(false);
  protected readonly dragging = signal(false);
  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releasePreview());
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.pick(input.files?.[0]);
    // Choosing the same file again must fire `change` again.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.pick(event.dataTransfer?.files?.[0]);
  }

  /** A screenshot pasted anywhere in the dialog (text pastes are left alone). */
  protected onPaste(event: ClipboardEvent): void {
    const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    void this.pick(file);
  }

  /** Checks and shrinks the chosen image, then shows it as the preview. */
  async pick(file: File | null | undefined): Promise<void> {
    if (!file) return;
    this.imageError.set(null);
    if (!ACCEPTED_IMAGE_TYPES.some((type) => type === file.type)) {
      this.imageError.set({ key: 'ERROR.IMAGE_IS_NOT_VALID' });
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      this.imageError.set({
        key: 'bases.form.imageTooLarge',
        params: { max: MAX_SOURCE_BYTES / 1024 / 1024 },
      });
      return;
    }
    this.preparing.set(true);
    try {
      const prepared = await prepareImage(file);
      this.releasePreview();
      this.previewObjectUrl = URL.createObjectURL(prepared.blob);
      this.image.set(prepared.blob);
      this.preview.set(this.previewObjectUrl);
    } catch {
      this.imageError.set({ key: 'ERROR.IMAGE_IS_NOT_VALID' });
    } finally {
      this.preparing.set(false);
    }
  }

  protected submit(): void {
    if (this.busy() || this.preparing()) return;
    const image = this.image();
    const imageMissing = !this.editing && !image;
    if (imageMissing) this.imageError.set({ key: 'ERROR.IMAGE_SHOULD_NOT_BE_EMPTY' });
    if (this.form.invalid || imageMissing) {
      this.form.markAllAsTouched();
      return;
    }

    const request = this.request(image);
    if (!request) {
      this.ref.close();
      return;
    }
    this.busy.set(true);
    this.errors.set([]);
    request.subscribe({
      next: (base) => this.ref.close(base),
      error: (error: unknown) => {
        this.showErrors(error);
        this.busy.set(false);
      },
    });
  }

  /** Create, or update with the changed fields only; `null` when nothing changed. */
  private request(image: Blob | null): Observable<DefenseBase> | null {
    const layoutUrl = this.form.controls.layoutUrl.value.trim();
    const description = this.form.controls.description.value.trim();
    const base = this.data.base;
    if (!base) return this.service.create({ layoutUrl, description, image: image! });

    const changes: DefenseBaseChanges = {};
    if (layoutUrl !== base.layoutUrl) changes.layoutUrl = layoutUrl;
    if (description !== base.description) changes.description = description;
    if (image) changes.image = image;
    return Object.keys(changes).length ? this.service.update(base.id, changes) : null;
  }

  /** Field messages go under their field, the others below the form. */
  private showErrors(error: unknown): void {
    const { fields, general } = backendErrors(error);
    const unplaced: BackendMessage[] = [...general];
    for (const message of fields) {
      if (message.field === 'image') {
        this.imageError.set(message);
      } else if (message.field === 'layoutUrl' || message.field === 'description') {
        const control = this.form.controls[message.field];
        control.setErrors({ server: message });
        control.markAsTouched();
      } else {
        unplaced.push(message);
      }
    }
    this.errors.set(unplaced);
  }

  private releasePreview(): void {
    if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
  }
}
