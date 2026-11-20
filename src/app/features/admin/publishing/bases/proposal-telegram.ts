import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BaseTelegramState } from '../../../../core/backend/backend-api.types';
import { LocalDatePipe } from '../../../../core/i18n/locale-pipes';
import { Icon } from '../../../../shared/components/icon/icon';
import { Tag, TagTone } from '../../../../shared/components/tag/tag';

type PostStatus = NonNullable<BaseTelegramState['post']>['status'];

const STATUS_TONES: Record<PostStatus, TagTone> = {
  sent: 'success',
  pending: 'gold',
  noChannel: 'gold',
  failed: 'danger',
};

/**
 * Where a proposed base goes (waiting) or went (approved) on Telegram: the channel of its town hall
 * and, once approved, how its post stands. What needs an administrator (no channel, a channel the
 * bot cannot write in, a failed post) links to the "Channels" tab.
 */
@Component({
  selector: 'crn-proposal-telegram',
  imports: [RouterLink, TranslatePipe, Icon, LocalDatePipe, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './proposal-telegram.html',
  styleUrl: './proposal-telegram.scss',
})
export class ProposalTelegram {
  readonly state = input.required<BaseTelegramState>();
  readonly townHallLevel = input.required<number>();

  protected readonly channel = computed(() => this.state().channel);
  protected readonly post = computed(() => this.state().post);
  protected readonly link = computed(() => {
    const username = this.channel()?.username;
    return username ? `https://t.me/${username}` : null;
  });
  protected readonly tone = computed(() => {
    const post = this.post();
    return post ? STATUS_TONES[post.status] : 'neutral';
  });
  /** No channel, a channel closed to the bot, or a failed post: something to fix in "Channels". */
  protected readonly needsCare = computed(
    () => !this.channel() || !this.channel()!.canPost || this.post()?.status === 'failed',
  );
}
