import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { AdminUser, BaseResult, Page } from './backend-api.types';

/** Administration API (ADMIN role): registered users, roles and linked player tags. */
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

  updateUser(id: string, changes: { roles?: ('USER' | 'ADMIN')[]; playerTag?: string | null }): Observable<AdminUser> {
    return this.http
      .patch<BaseResult<AdminUser>>(`${this.url}/${encodeURIComponent(id)}`, changes)
      .pipe(map((response) => response.result!));
  }
}
