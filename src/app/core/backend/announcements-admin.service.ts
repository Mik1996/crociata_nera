import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { LanguageCode } from '../i18n/languages';
import { Announcement, AnnouncementSettings, BaseResult } from './backend-api.types';

/**
 * Announcements of the Telegram channel (ADMIN role): drafts prepared by the backend when a month
 * or a season closes, a record falls or a player is promoted, published or discarded here. Every
 * request carries the language of the page (`lang`): generated captions and pictures come in it, and
 * a post goes out in it.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementsAdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/admin/announcements`;

  /** The drafts, then the latest published or discarded. Always fresh: drafts follow the data. */
  list(lang: LanguageCode): Observable<Announcement[]> {
    return this.http
      .get<BaseResult<Announcement[]>>(this.url, { params: { lang }, context: noCache() })
      .pipe(map((response) => response.result!));
  }

  /** Picture `page` (from 1) as JPEG. */
  image(id: string, page: number, lang: LanguageCode): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/images/${page}`, {
      params: { lang },
      responseType: 'blob',
      context: noCache(),
    });
  }

  /** New caption of a draft; `null` goes back to the generated one. */
  updateCaption(id: string, caption: string | null, lang: LanguageCode): Observable<Announcement> {
    return this.http
      .patch<BaseResult<Announcement>>(`${this.url}/${id}`, { caption }, { params: { lang } })
      .pipe(map((response) => response.result!));
  }

  publish(id: string, lang: LanguageCode): Observable<Announcement> {
    return this.http
      .post<BaseResult<Announcement>>(`${this.url}/${id}/publish`, {}, { params: { lang } })
      .pipe(map((response) => response.result!));
  }

  discard(id: string, lang: LanguageCode): Observable<Announcement> {
    return this.http
      .post<BaseResult<Announcement>>(`${this.url}/${id}/discard`, {}, { params: { lang } })
      .pipe(map((response) => response.result!));
  }

  /** Kinds of announcement that get drafts. */
  settings(): Observable<AnnouncementSettings> {
    return this.http
      .get<BaseResult<AnnouncementSettings>>(`${this.url}/settings`, { context: noCache() })
      .pipe(map((response) => response.result!));
  }

  /** Turns kinds on or off (the others stay as they are); answers every kind. */
  updateSettings(kinds: AnnouncementSettings['kinds']): Observable<AnnouncementSettings> {
    return this.http
      .put<BaseResult<AnnouncementSettings>>(`${this.url}/settings`, { kinds })
      .pipe(map((response) => response.result!));
  }
}
