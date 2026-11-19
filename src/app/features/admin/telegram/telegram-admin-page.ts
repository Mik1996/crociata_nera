import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import {
  BackendMessage,
  TelegramChat,
  TelegramStatus,
} from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { TelegramAdminService } from '../../../core/backend/telegram-admin.service';
import { CLAN_CASTLE_CAPACITY } from '../../../core/game/clan-castle';
import { TOWN_HALL_IMAGES } from '../../../core/game/game-assets';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../core/i18n/locale-pipes';
import { Alert } from '../../../shared/components/alert/alert';
import { Icon } from '../../../shared/components/icon/icon';
import { LoadState } from '../../../shared/components/load-state/load-state';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Select, SelectOption } from '../../../shared/components/select/select';
import { Tag } from '../../../shared/components/tag/tag';
import { ScrollFade } from '../../../shared/directives/scroll-fade';

/** Value of the content choice meaning "nothing": no town hall, not the announcements. */
const NO_CONTENT = 0;
/** Value of the content choice for the announcements chat. */
const ANNOUNCEMENTS = 'announcements';
/** What a chat receives: nothing, the announcements, or the bases of a town hall level. */
type ChatContent = typeof NO_CONTENT | typeof ANNOUNCEMENTS | number;
/** Lowest town hall offered: below it there are no war bases worth sharing. */
const LOWEST_TOWN_HALL = 3;

/**
 * Telegram bot of the site (administrators): the channels it was seen in, the town hall each one
 * receives the bases of, and how the posts of the arsenal stand (sent, waiting for a channel,
 * failed). The posts themselves go out from the backend whenever the arsenal changes.
 */
@Component({
  selector: 'crn-telegram-admin-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
    RouterLink,
    TranslatePipe,
    Alert,
    Icon,
    LoadState,
    LocalDatePipe,
    PageHeader,
    ScrollFade,
    Select,
    Tag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './telegram-admin-page.html',
  styleUrl: './telegram-admin-page.scss',
})
export class TelegramAdminPage {
  private readonly service = inject(TelegramAdminService);
  private readonly language = inject(LanguageService);

  protected readonly status = rxResource({ stream: () => this.service.status() });
  protected readonly data = computed(() => (this.status.hasValue() ? this.status.value() : null));

  /** The chat being changed (its controls are disabled meanwhile); `sync` for "Try again". */
  protected readonly busy = signal<number | 'add' | 'sync' | null>(null);
  protected readonly feedback = signal<{
    kind: 'success' | 'error';
    messages: BackendMessage[];
  } | null>(null);
  protected readonly newChat = signal('');

  /** Town halls offered for a chat: from one above the highest known down, plus "none". */
  private readonly levels = (() => {
    const highest = Math.max(...Object.keys(CLAN_CASTLE_CAPACITY).map(Number)) + 1;
    return Array.from({ length: highest - LOWEST_TOWN_HALL + 1 }, (_, i) => highest - i);
  })();

  /**
   * Choices of a chat: nothing, the announcements (when no other chat has them) and the town halls
   * not taken by another chat. The announcements chat is offered no town hall: it must go back to
   * "nothing" first, so that bases never reach it by mistake.
   */
  protected contentOptions(chat: TelegramChat): SelectOption<ChatContent>[] {
    const others = (this.data()?.chats ?? []).filter((c) => c.chatId !== chat.chatId);
    const taken = new Set(others.map((c) => c.townHallLevel).filter((level) => level !== null));
    const options: SelectOption<ChatContent>[] = [
      { value: NO_CONTENT, label: this.language.t('telegramAdmin.chats.noTownHall') },
    ];
    if (!others.some((c) => c.purpose === ANNOUNCEMENTS)) {
      options.push({
        value: ANNOUNCEMENTS,
        label: this.language.t('telegramAdmin.chats.announcements'),
        icon: 'campaign',
      });
    }
    if (chat.purpose === ANNOUNCEMENTS) return options;
    return [
      ...options,
      ...this.levels
        .filter((level) => !taken.has(level))
        .map((level) => ({ value: level, label: `TH${level}`, image: TOWN_HALL_IMAGES[level] })),
    ];
  }

  protected contentOf(chat: TelegramChat): ChatContent {
    if (chat.purpose === ANNOUNCEMENTS) return ANNOUNCEMENTS;
    return chat.townHallLevel ?? NO_CONTENT;
  }

  protected setContent(chat: TelegramChat, value: ChatContent | undefined): void {
    if (value === undefined || value === this.contentOf(chat)) return;
    const content: Pick<TelegramChat, 'purpose' | 'townHallLevel'> =
      value === ANNOUNCEMENTS
        ? { purpose: ANNOUNCEMENTS, townHallLevel: null }
        : { purpose: 'bases', townHallLevel: value || null };
    this.run(chat.chatId, this.service.setContent(chat.chatId, content), (updated) => {
      this.replaceChat(updated);
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_UPDATED', params: { name: updated.title } }];
    });
  }

  protected setLocked(chat: TelegramChat, locked: boolean): void {
    this.run(chat.chatId, this.service.setLocked(chat.chatId, locked), (updated) => {
      this.replaceChat(updated);
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_UPDATED', params: { name: updated.title } }];
    });
  }

  protected addChat(): void {
    const chat = this.newChat().trim();
    if (!chat) return;
    this.run('add', this.service.addChat(chat), (added) => {
      this.newChat.set('');
      this.status.reload();
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_ADDED', params: { name: added.title } }];
    });
  }

  protected removeChat(chat: TelegramChat): void {
    this.run(chat.chatId, this.service.removeChat(chat.chatId), () => {
      this.status.update(
        (s) => s && { ...s, chats: s.chats.filter((c) => c.chatId !== chat.chatId) },
      );
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_REMOVED' }];
    });
  }

  protected sync(): void {
    this.run('sync', this.service.sync(), (status) => {
      this.status.set(status);
      return [{ key: 'SUCCESS.TELEGRAM_SYNC_STARTED' }];
    });
  }

  /** `https://t.me/<username>` of a public chat. */
  protected link(chat: TelegramChat): string | null {
    return chat.username ? `https://t.me/${chat.username}` : null;
  }

  private replaceChat(chat: TelegramChat): void {
    this.status.update(
      (s: TelegramStatus | undefined) =>
        s && { ...s, chats: s.chats.map((c) => (c.chatId === chat.chatId ? chat : c)) },
    );
  }

  /** Runs a change, showing what the backend answered. */
  private run<T>(
    busy: number | 'add' | 'sync',
    request: Observable<T>,
    done: (value: T) => BackendMessage[],
  ): void {
    this.busy.set(busy);
    this.feedback.set(null);
    request.subscribe({
      next: (value) => {
        this.feedback.set({ kind: 'success', messages: done(value) });
        this.busy.set(null);
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.feedback.set({ kind: 'error', messages: [...general, ...fields] });
        this.busy.set(null);
      },
    });
  }
}
