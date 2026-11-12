import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { AdminUser, BaseResult, Page } from './backend-api.types';

/** Administration API (ADMIN role): registered users, roles, linked player tags and deletion. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/admin/users`;

  /** Always fresh: the list changes as members sign up. */
  listUsers(search = '', page = 1, limit = 50): Observable<Page<AdminUser>> {
    const params: Record<string, string | number> = { page, limit };
    if (search.trim()) params['search'] = search.trim();
    return this.http
      .get<BaseResult<Page<AdminUser>>>(this.url, { params, context: noCache() })
      .pipe(map((response) => response.result!));
  }

  updateUser(id: string, changes: { roles?: ('USER' | 'ADMIN')[] }): Observable<AdminUser> {
    return this.http
      .patch<BaseResult<AdminUser>>(`${this.url}/${encodeURIComponent(id)}`, changes)
      .pipe(map((response) => response.result!));
  }

  /** Links one or more Clash of Clans accounts to a user (no in-game token: they count as verified). */
  linkPlayers(id: string, playerTags: string[]): Observable<AdminUser> {
    return this.http
      .post<BaseResult<AdminUser>>(`${this.url}/${encodeURIComponent(id)}/players`, { playerTags })
      .pipe(map((response) => response.result!));
  }

  /** Deletes a user; `username` must be typed again, exactly, as a confirmation. */
  deleteUser(id: string, username: string): Observable<void> {
    return this.http
      .delete<BaseResult<null>>(`${this.url}/${encodeURIComponent(id)}`, { body: { username } })
      .pipe(map(() => undefined));
  }

  /** Unlinks one Clash of Clans account of a user. */
  unlinkPlayer(id: string, tag: string): Observable<AdminUser> {
    const path = `${encodeURIComponent(id)}/players/${encodeURIComponent(tag.replace(/^#/, ''))}`;
    return this.http
      .delete<BaseResult<AdminUser>>(`${this.url}/${path}`)
      .pipe(map((response) => response.result!));
  }
}
