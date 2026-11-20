import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import {
  BackendMessage,
  TelegramChat,
  TelegramStatus,
} from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { TelegramAdminService } from '../../../core/backend/telegram-admin.service';

/** What is being changed: a chat (its controls are disabled meanwhile), an addition, a retry. */
export type TelegramBusy = number | 'add' | 'sync';

export const ANNOUNCEMENTS_PURPOSE = 'announcements';

/**
 * State of the Telegram page, shared by its tabs (provided by the page): the bot and its chats read
 * once, the changes to them (made in the "Bot and channels" tab only), and what the backend answered
 * to the last one.
 */
@Injectable()
export class TelegramAdminState {
  private readonly service = inject(TelegramAdminService);

  readonly status = rxResource({ stream: () => this.service.status() });
  readonly data = computed(() => (this.status.hasValue() ? this.status.value() : null));
  readonly chats = computed(() => this.data()?.chats ?? []);
  /** The chat getting the announcements, if any. */
  readonly announcementsChat = computed(
    () => this.chats().find((c) => c.purpose === ANNOUNCEMENTS_PURPOSE) ?? null,
  );

  readonly busy = signal<TelegramBusy | null>(null);
  readonly feedback = signal<{ kind: 'success' | 'error'; messages: BackendMessage[] } | null>(
    null,
  );

  /** Sets what a chat receives: the bases of a town hall (or none), or the announcements. */
  setContent(chat: TelegramChat, content: Pick<TelegramChat, 'purpose' | 'townHallLevel'>): void {
    this.run(chat.chatId, this.service.setContent(chat.chatId, content), (updated) => {
      this.replaceChat(updated);
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_UPDATED', params: { name: updated.title } }];
    });
  }

  setLocked(chat: TelegramChat, locked: boolean): void {
    this.run(chat.chatId, this.service.setLocked(chat.chatId, locked), (updated) => {
      this.replaceChat(updated);
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_UPDATED', params: { name: updated.title } }];
    });
  }

  /** Adds a chat by `@username` or id; `done` runs when it was added. */
  addChat(chat: string, done: () => void): void {
    this.run('add', this.service.addChat(chat), (added) => {
      done();
      this.status.reload();
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_ADDED', params: { name: added.title } }];
    });
  }

  removeChat(chat: TelegramChat): void {
    this.run(chat.chatId, this.service.removeChat(chat.chatId), () => {
      this.status.update(
        (s) => s && { ...s, chats: s.chats.filter((c) => c.chatId !== chat.chatId) },
      );
      return [{ key: 'SUCCESS.TELEGRAM_CHAT_REMOVED' }];
    });
  }

  /** Tries the failed posts again now. */
  sync(): void {
    this.run('sync', this.service.sync(), (status) => {
      this.status.set(status);
      return [{ key: 'SUCCESS.TELEGRAM_SYNC_STARTED' }];
    });
  }

  /** `https://t.me/<username>` of a public chat. */
  link(chat: TelegramChat): string | null {
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
    busy: TelegramBusy,
    request: Observable<T>,
    done: (value: T) => BackendMessage[],
  ): void {
    this.busy.set(busy);
    this.feedback.set(null);
    request.subscribe({
      next: (value) => {
        const messages = done(value);
        this.feedback.set(messages.length ? { kind: 'success', messages } : null);
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
