import { inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CocApiService } from './coc-api';

/**
 * Public data of the clans of the Crusade (`GET /api/v1/welcome`) for a page: what visitors may
 * see, without the clan pages' routes (members by name and role only). Every reader asks for it:
 * the HTTP cache shares one request (in flight, then cached). Call in an injection context.
 */
export function injectPublicClans() {
  const api = inject(CocApiService);
  return rxResource({ stream: () => api.getWelcome() });
}
