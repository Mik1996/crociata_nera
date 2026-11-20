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
 * "Bases" tab of the Telegram page (administrators): how the posts of the arsenal stand (sent,
 * waiting for a channel, failed). The posts go out from the backend whenever the arsenal changes;
 * the town hall of each channel is chosen in the "Bot and channels" tab.
 */
@Component({
  selector: 'crn-telegram-bases',
  imports: [MatButtonModule, RouterLink, TranslatePipe, Alert, Icon, LocalDatePipe, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './telegram-bases.html',
  styleUrl: './telegram-bases.scss',
})
export class TelegramBases {
  protected readonly state = inject(TelegramAdminState);
}
