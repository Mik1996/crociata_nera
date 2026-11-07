import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { cacheFor } from '../http/http-cache';
import { BaseResult, PlayerRecord } from './backend-api.types';

/** Players saved by the backend, with the commendations they earned (frozen when awarded). */
@Injectable({ providedIn: 'root' })
export class PlayerRecordsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/players`;

  /** `null` when the player was never saved (no commendation yet and never seen in the clan). */
  getPlayer(tag: string): Observable<PlayerRecord | null> {
    return this.http
      .get<BaseResult<PlayerRecord>>(`${this.url}/${encodeURIComponent(tag)}`, { context: cacheFor({ minutes: 5 }) })
      .pipe(
        map((response) => response.result),
        catchError((err: HttpErrorResponse) => (err.status === 404 ? of(null) : throwError(() => err))),
      );
  }
}
