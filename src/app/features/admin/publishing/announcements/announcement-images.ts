import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin, map } from 'rxjs';
import { AnnouncementsAdminService } from '../../../../core/backend/announcements-admin.service';
import { Announcement } from '../../../../core/backend/backend-api.types';
import { Icon } from '../../../../shared/components/icon/icon';

/**
 * The pictures of an announcement, as they go to Telegram, side by side; each opens full size in a
 * new tab. Drawn again by the backend whenever the announcement changes (`updatedAt`).
 */
@Component({
  selector: 'crn-announcement-images',
  imports: [TranslatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-images.html',
  styleUrl: './announcement-images.scss',
})
export class AnnouncementImages {
  readonly announcement = input.required<Announcement>();

  private readonly service = inject(AnnouncementsAdminService);

  protected readonly images = rxResource({
    params: () => {
      const { id, pages, updatedAt, language } = this.announcement();
      return { id, pages, updatedAt, language };
    },
    stream: ({ params }) =>
      forkJoin(
        Array.from({ length: params.pages }, (_, i) =>
          this.service.image(params.id, i + 1, params.language),
        ),
      ).pipe(map((blobs) => blobs.map((blob) => URL.createObjectURL(blob)))),
  });

  /** Placeholders while the pictures are drawn. */
  protected readonly placeholders = () =>
    Array.from({ length: this.announcement().pages }, (_, i) => i);

  constructor() {
    // Object URLs hold the pictures in memory until revoked.
    effect((onCleanup) => {
      const urls = this.images.hasValue() ? this.images.value() : [];
      onCleanup(() => urls.forEach((url) => URL.revokeObjectURL(url)));
    });
  }
}
