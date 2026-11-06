import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { InterpolationParameters } from '@ngx-translate/core';
import { APP_CONFIG } from '../config/app-config';
import { cacheFor } from '../http/http-cache';
import { BaseResult } from '../backend/backend-api.types';
import { TranslatableError } from '../i18n/translatable-error';
import { Clan, HistoryPeriod, MonthSummary, War, PlayerProfile } from '../models';
import { CocApiService } from './coc-api';
import { closeExpiredWars, mapClan, mapWar, mapWarLogEntry, mergeWarHistory, mapPlayerProfile } from './coc-api.mappers';
import { CocClan, CocClientError, CocWar, CocWarLog, CocPlayer } from './coc-api.types';

/**
 * API error carrying Supercell's original `reason` (e.g. `accessDenied.invalidIp`).
 * `message` is in English (logs and diagnostics); the UI uses `i18nKey` to translate it.
 */
export class CocApiHttpError extends Error implements TranslatableError {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
    readonly i18nKey = 'errors.server',
    readonly i18nParams?: InterpolationParameters,
  ) {
    super(message);
    this.name = 'CocApiHttpError';
  }
}

/**
 * HTTP implementation of the data layer.
 *
 * Requests go to `AppConfig.apiBaseUrl`, which must point to the BACKEND PROXY (`server/`),
 * never directly to api.clashofclans.com: the API token stays server-side.
 *
 * Endpoints used:
 * - `GET {base}/clans/{tag}`              -> `/v1/clans/{tag}`
 * - `GET {base}/clans/{tag}/currentwar`   -> `/v1/clans/{tag}/currentwar`
 * - `GET {base}/clans/{tag}/warlog`       -> `/v1/clans/{tag}/warlog` (summaries only)
 * - `GET {base}/archive/wars`             -> `currentwar` snapshots saved by the proxy (with details)
 * - `GET {base}/history`                  -> list of months in the monthly history
 * - `GET {base}/history/{YYYY-MM|all}`    -> statistics for a period
 * - `GET {base}/players/{tag}`            -> `/v1/players/{tag}` (clan members only)
 *
 * War history and monthly statistics come first from the application backend
 * (`{backend}/wars/archive`, `{backend}/history`), which saves every war in MongoDB; if the
 * backend cannot answer, the proxy archive above is used instead.
 *
 * Responses are cached by `cacheInterceptor`: 15 minutes by default, less for data that
 * changes during a war (see {@link CACHE}).
 */
/** Saved wars requested from the backend for the history (the war log covers older ones). */
const ARCHIVE_LIMIT = 60;

/** Cache duration per kind of data (the others use the 15-minute default). */
const CACHE = {
  /** Attacks arrive continuously during the battle day. */
  currentWar: cacheFor({ minutes: 2 }),
  /** The proxy archives the current war every 15 minutes. */
  archive: cacheFor({ minutes: 5 }),
  /** Profiles change with every upgrade, but rarely within minutes. */
  player: cacheFor({ minutes: 10 }),
};

@Injectable()
export class HttpCocApiService extends CocApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  private get clanPath(): string {
    return `${this.config.apiBaseUrl}/clans/${encodeURIComponent(this.config.clanTag)}`;
  }

  getClan(): Observable<Clan> {
    return this.http.get<CocClan>(this.clanPath).pipe(map(mapClan), catchError(toApiError));
  }

  getCurrentWar(): Observable<War | null> {
    return this.http.get<CocWar>(`${this.clanPath}/currentwar`, { context: CACHE.currentWar }).pipe(
      map(mapWar),
      catchError((err: HttpErrorResponse) =>
        // Private war log: the API does not expose the current war.
        isPrivateWarLog(err) ? of(null) : toApiError(err),
      ),
    );
  }

  getWarHistory(): Observable<War[]> {
    const proxyArchive$ = this.http.get<CocWar[]>(`${this.config.apiBaseUrl}/archive/wars`, { context: CACHE.archive });
    const archive$ = this.http
      .get<BaseResult<CocWar[]>>(`${this.config.backendBaseUrl}/wars/archive`, {
        params: { limit: ARCHIVE_LIMIT },
        context: CACHE.archive,
      })
      .pipe(
        map((response) => response.result ?? []),
        // Backend unreachable: fall back to the proxy archive.
        catchError(() => proxyArchive$),
        map((snapshots) => snapshots.map(mapWar).filter((w): w is War => w !== null)),
        // The archive is optional: if missing, only the war log is used.
        catchError(() => of<War[]>([])),
      );
    const warLog$ = this.http.get<CocWarLog>(`${this.clanPath}/warlog`).pipe(
      map((log) => log.items.map(mapWarLogEntry).filter((w): w is War => w !== null)),
      catchError((err: HttpErrorResponse) => (isPrivateWarLog(err) ? of<War[]>([]) : toApiError(err))),
    );
    return forkJoin([archive$, warLog$]).pipe(
      map(([archived, warLog]) => mergeWarHistory(closeExpiredWars(archived, new Date()), warLog)),
    );
  }

  getHistoryMonths(): Observable<MonthSummary[]> {
    const proxy$ = this.http.get<MonthSummary[]>(`${this.config.apiBaseUrl}/history`).pipe(catchError(toApiError));
    return this.http.get<BaseResult<MonthSummary[]>>(`${this.config.backendBaseUrl}/history`).pipe(
      map((response) => response.result ?? []),
      catchError(() => proxy$),
    );
  }

  getHistoryPeriod(period: string): Observable<HistoryPeriod | null> {
    const path = `/history/${encodeURIComponent(period)}`;
    const proxy$ = this.http
      .get<HistoryPeriod>(`${this.config.apiBaseUrl}${path}`)
      .pipe(
        // 404 = no wars recorded in the month.
        catchError((err: HttpErrorResponse) => (err.status === 404 && errorBody(err) ? of(null) : toApiError(err))),
      );
    return this.http.get<BaseResult<HistoryPeriod>>(`${this.config.backendBaseUrl}${path}`).pipe(
      map((response) => response.result),
      // 404 from the backend = no wars in that month; any other failure: ask the proxy.
      catchError((err: HttpErrorResponse) => (err.status === 404 && isBackendError(err) ? of(null) : proxy$)),
    );
  }

  getPlayer(tag: string): Observable<PlayerProfile | null> {
    return this.http.get<CocPlayer>(`${this.config.apiBaseUrl}/players/${encodeURIComponent(tag)}`, { context: CACHE.player }).pipe(
      map(mapPlayerProfile),
      // 404 = not a member of the clan (the proxy refuses other players).
      catchError((err: HttpErrorResponse) => (err.status === 404 && errorBody(err) ? of(null) : toApiError(err))),
    );
  }

  getWar(id: string): Observable<War | null> {
    return this.getCurrentWar().pipe(
      catchError(() => of(null)),
      // If it is not the current war, look it up in the history.
      switchMap((current) =>
        current?.id === id
          ? of(current)
          : this.getWarHistory().pipe(map((wars) => wars.find((w) => w.id === id) ?? null)),
      ),
    );
  }
}

/** The backend answered with its envelope (as opposed to a proxy or network error). */
function isBackendError(err: HttpErrorResponse): boolean {
  return typeof err.error === 'object' && err.error !== null && 'status' in err.error && 'messages' in err.error;
}

function errorBody(err: HttpErrorResponse): CocClientError | undefined {
  return typeof err.error === 'object' && err.error && 'reason' in err.error
    ? (err.error as CocClientError)
    : undefined;
}

/** 403 `accessDenied` (without `.invalidIp`) = the clan war log is not public. */
function isPrivateWarLog(err: HttpErrorResponse): boolean {
  return err.status === 403 && errorBody(err)?.reason === 'accessDenied';
}

function toApiError(err: HttpErrorResponse): Observable<never> {
  const body = errorBody(err);
  const reason = body?.reason;
  const fail = (key: string, message: string, params?: InterpolationParameters) =>
    throwError(() => new CocApiHttpError(message.trim(), err.status, reason, key, params));

  if (reason === 'accessDenied.invalidIp') {
    const detail = body?.message ?? '';
    return fail(
      'errors.invalidIp',
      'The API key does not allow the IP address of the proxy server. ' +
        'Create a new key on developer.clashofclans.com with the correct IP. ' +
        detail,
      { detail },
    );
  }
  if (reason === 'accessDenied') {
    return fail('errors.accessDenied', 'Access denied by the API: invalid or expired token.');
  }
  if (reason === 'proxy.unreachable') {
    return fail('errors.apiUnreachable', 'The proxy cannot reach api.clashofclans.com.');
  }
  if (err.status === 0 || err.status === 502 || err.status === 504 || (err.status === 500 && !body)) {
    return fail('errors.proxyUnreachable', 'Proxy unreachable. Start the backend with “npm run server”.');
  }
  const known: Record<number, [string, string]> = {
    404: ['errors.notFound', 'Clan or resource not found.'],
    429: ['errors.tooManyRequests', 'Too many requests to the API: try again in a moment.'],
    503: ['errors.maintenance', 'Clash of Clans API under maintenance.'],
  };
  const match = known[err.status];
  if (match) return fail(match[0], match[1]);
  return fail('errors.server', body?.message ?? `Server error (${err.status}).`, { status: err.status });
}
