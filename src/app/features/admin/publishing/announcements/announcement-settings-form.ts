import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslatePipe } from '@ngx-translate/core';
import { AnnouncementsAdminService } from '../../../../core/backend/announcements-admin.service';
import {
  AnnouncementKind,
  AnnouncementSettings,
  BackendMessage,
} from '../../../../core/backend/backend-api.types';
import { backendErrors } from '../../../../core/backend/backend-errors';
import { Alert } from '../../../../shared/components/alert/alert';
import { Icon } from '../../../../shared/components/icon/icon';
import { LoadState } from '../../../../shared/components/load-state/load-state';
import { KIND_ICONS } from './announcement-kinds';

type KindControls = Partial<Record<AnnouncementKind, FormControl<boolean>>>;

/**
 * Form of the Announcements tab: a switch for each kind of announcement, to turn on or off the drafts
 * the backend prepares. A kind turned off gets no new drafts, and what closes while it is off is not
 * announced once it is on again.
 */
@Component({
  selector: 'crn-announcement-settings-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatSlideToggleModule,
    TranslatePipe,
    Alert,
    Icon,
    LoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-settings-form.html',
  styleUrl: './announcement-settings-form.scss',
})
export class AnnouncementSettingsForm {
  private readonly service = inject(AnnouncementsAdminService);

  protected readonly kindIcons = KIND_ICONS;
  protected readonly settings = rxResource({ stream: () => this.service.settings() });
  /** The kinds, in the backend's order. */
  protected readonly kinds = signal<AnnouncementKind[]>([]);
  protected readonly form = new FormGroup<KindControls>({});
  protected readonly saving = signal(false);
  protected readonly feedback = signal<{
    kind: 'success' | 'error';
    messages: BackendMessage[];
  } | null>(null);

  constructor() {
    effect(() => {
      if (this.settings.hasValue()) this.show(this.settings.value());
    });
  }

  /** Puts the saved settings in the form (adding a switch for a kind not seen yet). */
  private show(settings: AnnouncementSettings): void {
    for (const { kind, enabled } of settings.kinds) {
      const control = this.form.controls[kind];
      if (control) control.reset(enabled);
      else this.form.addControl(kind, new FormControl(enabled, { nonNullable: true }));
    }
    this.kinds.set(settings.kinds.map((k) => k.kind));
    this.form.markAsPristine();
  }

  protected save(): void {
    const saved = this.settings.hasValue() ? this.settings.value().kinds : [];
    const value = this.form.getRawValue();
    const changes = saved
      .filter(({ kind, enabled }) => value[kind] !== undefined && value[kind] !== enabled)
      .map(({ kind }) => ({ kind, enabled: value[kind]! }));
    if (!changes.length) {
      this.form.markAsPristine();
      return;
    }
    this.saving.set(true);
    this.feedback.set(null);
    this.form.disable();
    this.service.updateSettings(changes).subscribe({
      next: (settings) => {
        this.form.enable();
        this.settings.set(settings);
        this.saving.set(false);
        this.feedback.set({
          kind: 'success',
          messages: [{ key: 'SUCCESS.ANNOUNCEMENT_SETTINGS_UPDATED' }],
        });
      },
      error: (error: unknown) => {
        this.form.enable();
        const { fields, general } = backendErrors(error);
        this.feedback.set({ kind: 'error', messages: [...general, ...fields] });
        this.saving.set(false);
      },
    });
  }

  /** Back to the saved settings. */
  protected revert(): void {
    if (this.settings.hasValue()) this.show(this.settings.value());
    this.feedback.set(null);
  }
}
