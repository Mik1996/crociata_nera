import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { SISTER_CLANS, SisterClan } from '../config/sister-clans';
import { Clan } from '../models';
import { CocApiService } from './coc-api';

/** A sister clan with its data from the Clash of Clans API. */
export interface LoadedSisterClan {
  sister: SisterClan;
  clan: Clan;
}

/**
 * The sister clans read so far, in display order. Each one is read on its own: a clan that cannot
 * be read is simply left out. Call in an injection context (e.g. a component field).
 */
export function injectSisterClans(): Signal<LoadedSisterClan[]> {
  const api = inject(CocApiService);
  const resources = SISTER_CLANS.map((sister) => ({
    sister,
    clan: rxResource({ stream: () => api.getClanByTag(sister.tag).pipe(catchError(() => of(null))) }),
  }));
  return computed(() =>
    resources.flatMap(({ sister, clan }) => {
      const value = clan.hasValue() ? clan.value() : null;
      return value ? [{ sister, clan: value }] : [];
    }),
  );
}
