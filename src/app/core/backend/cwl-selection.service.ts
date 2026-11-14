import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { BaseResult, CwlExclusion, CwlSelection } from './backend-api.types';

/**
 * Ranking of the clan members for the CWL line-up (leaders only); exclusions by administrators.
 * Implementations: {@link HttpCwlSelectionService} (backend) and `MockCwlSelectionService` (demo
 * without backend), chosen by `provideCocApi`.
 */
export abstract class CwlSelectionService {
  abstract get(): Observable<CwlSelection>;
  /** Excludes a player from the line-up (administrators); excluding again replaces the reason. */
  abstract exclude(tag: string, reason: string | null): Observable<CwlExclusion>;
  /** Takes an excluded player back into the line-up (administrators). */
  abstract readmit(tag: string): Observable<void>;
}

/** Most characters of the reason of an exclusion (same limit as the backend). */
export const MAX_EXCLUSION_REASON_LENGTH = 200;

@Injectable()
export class HttpCwlSelectionService extends CwlSelectionService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/cwl/selection`;

  get(): Observable<CwlSelection> {
    // Always fresh: the ranking follows the members, their town halls, the wars and the exclusions.
    return this.http
      .get<BaseResult<CwlSelection>>(this.url, { context: noCache() })
      .pipe(map((response) => response.result!));
  }

  exclude(tag: string, reason: string | null): Observable<CwlExclusion> {
    return this.http
      .put<BaseResult<CwlExclusion>>(this.exclusionUrl(tag), { reason })
      .pipe(map((response) => response.result!));
  }

  readmit(tag: string): Observable<void> {
    return this.http.delete<BaseResult<null>>(this.exclusionUrl(tag)).pipe(map(() => undefined));
  }

  /** The tag goes in the path without `#`. */
  private exclusionUrl(tag: string): string {
    return `${this.url}/exclusions/${encodeURIComponent(tag.replace(/^#/, ''))}`;
  }
}
