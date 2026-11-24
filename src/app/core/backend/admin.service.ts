import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { AdminUser, BaseResult, Page } from './backend-api.types';

/** Query of `GET /admin/users`: page (from 1), size, filters by column and sort. */
export interface AdminUserQuery {
  page?: number;
  limit?: number;
  search?: string;
  user?: string;
  playerTag?: string;
  /** Text in the in-game name of a linked account. */
  player?: string;
  admin?: boolean;
  verified?: boolean;
  createdFrom?: string;
  createdBefore?: string;
  sort?: 'username' | 'email' | 'verified' | 'createdAt';
  order?: 'asc' | 'desc';
}

/** Administration API (ADMIN role): registered users, roles, linked player tags and deletion. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/admin/users`;

  /**
   * A page of users, filtered and sorted by the backend (`page` from 1). Always fresh: the list
   * changes as members sign up.
   */
  listUsers(params: AdminUserQuery = {}): Observable<Page<AdminUser>> {
    return this.http
      .get<BaseResult<Page<AdminUser>>>(this.url, { params: { ...params }, context: noCache() })
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
