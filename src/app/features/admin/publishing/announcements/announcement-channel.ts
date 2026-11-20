import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Alert } from '../../../../shared/components/alert/alert';
import { Icon } from '../../../../shared/components/icon/icon';
import { Tag } from '../../../../shared/components/tag/tag';
import { TelegramAdminState } from '../telegram-admin-state';

/**
 * Where the announcements go, at the top of the announcements tab (read only: the channel is chosen
 * in the "Bot and channels" tab), or a warning when no channel gets them.
 */
@Component({
  selector: 'crn-announcement-channel',
  imports: [MatTooltipModule, RouterLink, TranslatePipe, Alert, Icon, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-channel.html',
  styleUrl: './announcement-channel.scss',
})
export class AnnouncementChannel {
  protected readonly state = inject(TelegramAdminState);
  protected readonly current = this.state.announcementsChat;
}
