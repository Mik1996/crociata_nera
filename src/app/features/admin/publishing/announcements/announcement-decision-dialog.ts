import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { AnnouncementsAdminService } from '../../../../core/backend/announcements-admin.service';
import { Announcement, BackendMessage } from '../../../../core/backend/backend-api.types';
import { backendErrors } from '../../../../core/backend/backend-errors';
import { LanguageService } from '../../../../core/i18n/language.service';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';

export interface AnnouncementDecisionData {
  announcement: Announcement;
  /** Title of the announcement, as the page shows it. */
  title: string;
  action: 'publish' | 'discard';
}

/**
 * Confirms the publication of an announcement in the Telegram channel (it cannot be taken back from
 * the site) or its discarding. Closes with the announcement as the backend returns it.
 */
@Component({
  selector: 'crn-announcement-decision-dialog',
  imports: [TranslatePipe, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-decision-dialog.html',
  styleUrl: './announcement-decision-dialog.scss',
})
export class AnnouncementDecisionDialog {
  protected readonly data = inject<AnnouncementDecisionData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<AnnouncementDecisionDialog, Announcement>>(MatDialogRef);
  private readonly service = inject(AnnouncementsAdminService);
  private readonly language = inject(LanguageService);

  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    const { announcement, action } = this.data;
    // The post goes out in the language of the page.
    const lang = this.language.current();
    const request =
      action === 'publish'
        ? this.service.publish(announcement.id, lang)
        : this.service.discard(announcement.id, lang);
    request.subscribe({
      next: (updated) => this.ref.close(updated),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }
}
