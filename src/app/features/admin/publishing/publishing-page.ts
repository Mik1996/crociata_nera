import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PendingPublications } from '../../../core/backend/pending-publications';
import { Alert } from '../../../shared/components/alert/alert';
import { Icon } from '../../../shared/components/icon/icon';
import { IconName } from '../../../shared/components/icon/icon-names';
import { LoadState } from '../../../shared/components/load-state/load-state';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ScrollFade } from '../../../shared/directives/scroll-fade';
import { SwipeTabs } from '../../../shared/directives/swipe-tabs';
import { AnnouncementChannel } from './announcements/announcement-channel';
import { TelegramAnnouncements } from './announcements/telegram-announcements';
import { BaseModeration } from './bases/base-moderation';
import { BasePosts } from './bases/base-posts';
import { TelegramBot } from './channels/telegram-bot';
import { TelegramAdminState } from './telegram-admin-state';

export type PublishingTab = 'bases' | 'announcements' | 'channels';

/**
 * The tabs, by their name in the URL (`?tab=channels`); the first one is the default. `pending`:
 * the part of {@link PendingPublications} shown as a badge on the tab.
 */
export const PUBLISHING_TABS: readonly {
  id: PublishingTab;
  icon: IconName;
  pending?: 'bases' | 'announcements';
}[] = [
  { id: 'bases', icon: 'castle', pending: 'bases' },
  { id: 'announcements', icon: 'campaign', pending: 'announcements' },
  { id: 'channels', icon: 'send' },
];

/**
 * Publications (administrators): everything that waits for a decision before going out, a tab per
 * job. Bases: how the Telegram posts of the arsenal stand, then the proposals of the members,
 * approved into the arsenal (and the Telegram channel of their town hall) or rejected. Announcements: the drafts prepared by the backend, published in the
 * announcements channel. Channels: the Telegram bot, the chats it was seen in with what each one
 * receives (the only place where they are managed). The tab
 * is in the URL (`?tab=channels`); the bot and its chats are read once for all the tabs
 * (`TelegramAdminState`).
 */
@Component({
  selector: 'crn-publishing-page',
  imports: [
    MatButtonModule,
    MatTabsModule,
    RouterLink,
    TranslatePipe,
    Alert,
    AnnouncementChannel,
    BaseModeration,
    BasePosts,
    Icon,
    LoadState,
    PageHeader,
    ScrollFade,
    SwipeTabs,
    TelegramAnnouncements,
    TelegramBot,
  ],
  providers: [TelegramAdminState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './publishing-page.html',
  styleUrl: './publishing-page.scss',
})
export class PublishingPage {
  protected readonly state = inject(TelegramAdminState);
  protected readonly pending = inject(PendingPublications);
  protected readonly tabs = PUBLISHING_TABS;
  /** `?tab=announcements|channels`, bound by the router. */
  readonly tab = input<string>();
  /** `?status=approved|rejected` of the bases tab, bound by the router. */
  readonly status = input<string>();
  protected readonly active = computed<PublishingTab>(
    () => (PUBLISHING_TABS.find((t) => t.id === this.tab()) ?? PUBLISHING_TABS[0]).id,
  );

  constructor() {
    // The answer to a change belongs to the tab it was made in.
    effect(() => {
      this.active();
      untracked(() => this.state.feedback.set(null));
    });
  }
}
