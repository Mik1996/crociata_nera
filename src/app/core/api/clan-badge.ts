import { inject, Injectable } from '@angular/core';
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
 * Official badge of the clan (`badgeUrls.large`), from the public data of the clans: header and the
 * empty states. `null` until loaded, when missing or when it cannot be read (callers show
 * {@link CLAN_CREST_URL}).
 */
@Injectable({ providedIn: 'root' })
export class ClanBadge {
  // Optional: components used in isolation (tests) work without the API.
  private readonly api = inject(CocApiService, { optional: true });

  // A plain subscription, not a resource: the header does not hold the app back from being stable.
  readonly url = toSignal(
    this.api
      ? this.api.getWelcome().pipe(
          map((data) => data.clan.badgeUrl ?? null),
          catchError(() => of(null)),
        )
      : of(null),
    { initialValue: null },
  );
}
