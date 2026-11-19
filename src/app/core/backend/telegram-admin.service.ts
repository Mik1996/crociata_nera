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

  /** Binds a chat to a town hall level (`null` unbinds it). */
  setTownHall(chatId: number, townHallLevel: number | null): Observable<TelegramChat> {
    return this.http
      .patch<BaseResult<TelegramChat>>(`${this.url}/chats/${chatId}`, { townHallLevel })
      .pipe(map((response) => response.result!));
  }

  /** Forgets a chat (its posts stay in Telegram). */
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
