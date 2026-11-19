import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { BaseResult, TelegramChat, TelegramStatus } from './backend-api.types';

/**
 * Telegram bot of the site (ADMIN role): the channels it was seen in, the town hall each one
 * receives the bases of, and how the posts of the arsenal stand.
 */
@Injectable({ providedIn: 'root' })
export class TelegramAdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/admin/telegram`;

  /** Always fresh: posts go out in the background. */
  status(): Observable<TelegramStatus> {
    return this.http
      .get<BaseResult<TelegramStatus>>(this.url, { context: noCache() })
      .pipe(map((response) => response.result!));
  }

  /** Adds a channel or group by its `@username` or numeric id. */
  addChat(chat: string): Observable<TelegramChat> {
    return this.http
      .post<BaseResult<TelegramChat>>(`${this.url}/chats`, { chat })
      .pipe(map((response) => response.result!));
  }

  /**
   * Sets what a chat receives: the bases of a town hall level (`null`: none), or the announcements
   * (`purpose: 'announcements'`, always without a town hall).
   */
  setContent(
    chatId: number,
    content: Pick<TelegramChat, 'purpose' | 'townHallLevel'>,
  ): Observable<TelegramChat> {
    return this.http
      .patch<BaseResult<TelegramChat>>(`${this.url}/chats/${chatId}`, content)
      .pipe(map((response) => response.result!));
  }

  /** Locks a chat (its town hall cannot change, it cannot be removed) or unlocks it. */
  setLocked(chatId: number, locked: boolean): Observable<TelegramChat> {
    return this.http
      .patch<BaseResult<TelegramChat>>(`${this.url}/chats/${chatId}`, { locked })
      .pipe(map((response) => response.result!));
  }

  /** Forgets a chat: its posts are deleted from it and wait for another channel. */
  removeChat(chatId: number): Observable<void> {
    return this.http
      .delete<BaseResult<null>>(`${this.url}/chats/${chatId}`)
      .pipe(map(() => undefined));
  }

  /** Tries the failed posts again now. */
  sync(): Observable<TelegramStatus> {
    return this.http
      .post<BaseResult<TelegramStatus>>(`${this.url}/sync`, {})
      .pipe(map((response) => response.result!));
  }
}
