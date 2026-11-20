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
import { Alert } from '../../../shared/components/alert/alert';
import { Icon } from '../../../shared/components/icon/icon';
import { IconName } from '../../../shared/components/icon/icon-names';
import { LoadState } from '../../../shared/components/load-state/load-state';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ScrollFade } from '../../../shared/directives/scroll-fade';
import { SwipeTabs } from '../../../shared/directives/swipe-tabs';
import { AnnouncementChannel } from './announcements/announcement-channel';
import { TelegramAnnouncements } from './announcements/telegram-announcements';
import { TelegramBases } from './bases/telegram-bases';
import { TelegramBot } from './bot/telegram-bot';
import { TelegramAdminState } from './telegram-admin-state';

export type TelegramTab = 'announcements' | 'bases' | 'bot';

/** The tabs, by their name in the URL (`?tab=channels`); the first one is the default. */
export const TELEGRAM_TABS: readonly { id: TelegramTab; icon: IconName }[] = [
  { id: 'bot', icon: 'send' },
  { id: 'bases', icon: 'castle' },
  { id: 'announcements', icon: 'campaign' },
];

/**
 * Telegram (administrators): everything the site posts there, a tab per job. Bot and channels (the
 * only place where channels are managed): the bot and every chat it was seen in, with what it
 * receives, to lock, forget or add. Bases: how the posts of the arsenal stand. Announcements: the
 * drafts prepared by the backend, to publish in the announcements channel. The tab is in the URL
 * (`?tab=bases`); the bot and its chats are read once for all the tabs (`TelegramAdminState`).
 */
@Component({
  selector: 'crn-telegram-admin-page',
  imports: [
    MatButtonModule,
    MatTabsModule,
    RouterLink,
    TranslatePipe,
    Alert,
    AnnouncementChannel,
    Icon,
    LoadState,
    PageHeader,
    ScrollFade,
    SwipeTabs,
    TelegramAnnouncements,
    TelegramBases,
    TelegramBot,
  ],
  providers: [TelegramAdminState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './telegram-admin-page.html',
  styleUrl: './telegram-admin-page.scss',
})
export class TelegramAdminPage {
  protected readonly state = inject(TelegramAdminState);
  protected readonly tabs = TELEGRAM_TABS;
  /** `?tab=announcements|channels`, bound by the router. */
  readonly tab = input<string>();
  protected readonly active = computed<TelegramTab>(
    () => (TELEGRAM_TABS.find((t) => t.id === this.tab()) ?? TELEGRAM_TABS[0]).id,
  );

  constructor() {
    // The answer to a change belongs to the tab it was made in.
    effect(() => {
      this.active();
      untracked(() => this.state.feedback.set(null));
    });
  }
}
