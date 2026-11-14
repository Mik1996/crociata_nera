import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { CrusadeOrder } from '../config/sister-clans';
import { CocApiService } from './coc-api';

/**
 * Logos of the clans of the Crusade (crowned helmets; Crociata Nera's is the favicon): the default
 * badge of a clan while the official one has not arrived, is missing, or fails to load (offline).
 */
export const CLAN_CRESTS: Readonly<Record<CrusadeOrder, string>> = {
  black: 'images/clan-crest-black.webp',
  red: 'images/clan-crest-red.webp',
  gold: 'images/clan-crest-gold.webp',
};

/** Logo of Crociata Nera, the clan of the site. */
export const CLAN_CREST_URL = CLAN_CRESTS.black;

/**
 * Official badge of the clan (`badgeUrls.large`), read once and shared: header and the empty
 * states. `null` until loaded, when missing or when the API is unavailable (callers show
 * {@link CLAN_CREST_URL}).
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
