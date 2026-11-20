import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalDatePipe } from '../../../../core/i18n/locale-pipes';
import { Alert } from '../../../../shared/components/alert/alert';
import { Icon } from '../../../../shared/components/icon/icon';
import { Tag } from '../../../../shared/components/tag/tag';
import { TelegramAdminState } from '../telegram-admin-state';

/**
 * Posts of the bases, at the top of the "Bases" tab of the Publications page (administrators): how
 * the posts of the whole arsenal stand (sent, waiting for a channel, failed), with a retry. The
 * posts go out from the backend whenever the arsenal changes, in the channel bound to the town hall
 * of each base (chosen in the "Channels" tab).
 */
@Component({
  selector: 'crn-base-posts',
  imports: [MatButtonModule, RouterLink, TranslatePipe, Alert, Icon, LocalDatePipe, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './base-posts.html',
  styleUrl: './base-posts.scss',
})
export class BasePosts {
  protected readonly state = inject(TelegramAdminState);
}
