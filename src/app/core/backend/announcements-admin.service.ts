import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { Announcement, BaseResult } from './backend-api.types';

/**
 * Announcements of the Telegram channel (ADMIN role): drafts prepared by the backend when a month
 * or a season closes or a record falls, published or discarded here.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementsAdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/admin/announcements`;

  /** The drafts, then the latest published or discarded. Always fresh: drafts follow the data. */
  list(): Observable<Announcement[]> {
    return this.http
      .get<BaseResult<Announcement[]>>(this.url, { context: noCache() })
      .pipe(map((response) => response.result!));
  }

  /** Picture `page` (from 1) as JPEG. */
  image(id: string, page: number): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/images/${page}`, {
      responseType: 'blob',
      context: noCache(),
    });
  }

  /** New caption of a draft; `null` goes back to the generated one. */
  updateCaption(id: string, caption: string | null): Observable<Announcement> {
    return this.http
      .patch<BaseResult<Announcement>>(`${this.url}/${id}`, { caption })
      .pipe(map((response) => response.result!));
  }

  publish(id: string): Observable<Announcement> {
    return this.http
      .post<BaseResult<Announcement>>(`${this.url}/${id}/publish`, {})
      .pipe(map((response) => response.result!));
  }

  discard(id: string): Observable<Announcement> {
    return this.http
      .post<BaseResult<Announcement>>(`${this.url}/${id}/discard`, {})
      .pipe(map((response) => response.result!));
  }
}
