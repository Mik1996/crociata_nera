import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { CocApiService } from './coc-api';

/**
 * Official badge of the clan (`badgeUrls.large`), read once and shared: header and the empty
 * states. `null` until loaded, when missing or when the API is unavailable (callers show
 * their fallback).
 */
@Injectable({ providedIn: 'root' })
export class ClanBadge {
  // Optional: components used in isolation (tests) work without the API.
  private readonly api = inject(CocApiService, { optional: true });

  readonly url = toSignal(
    this.api
      ? this.api.getClan().pipe(
          map((clan) => clan?.badgeUrl ?? null),
          catchError(() => of(null)),
        )
      : of(null),
    { initialValue: null },
  );
}
