import { computed, Signal } from '@angular/core';
import { SISTER_CLANS, SisterClan } from '../config/sister-clans';
import { Clan } from '../models';
import { injectPublicClans } from './public-clans';

/** A sister clan with its data from the Clash of Clans API. */
export interface LoadedSisterClan {
  sister: SisterClan;
  clan: Clan;
}

/**
 * The sister clans read so far, in display order (from the public data of the clans): a clan
 * that cannot be read is simply left out. Call in an injection context (e.g. a component field).
 */
export function injectSisterClans(): Signal<LoadedSisterClan[]> {
  const publicClans = injectPublicClans();
  return computed(() => {
    const sisters = publicClans.hasValue() ? publicClans.value().sisters : [];
    return SISTER_CLANS.flatMap((sister) => {
      const clan = sisters.find((c) => c.tag === sister.tag);
      return clan ? [{ sister, clan }] : [];
    });
  });
}
