import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CocApiHttpError, toApiError } from '../api/coc-api-errors';
import { BACKEND_OFFLINE, BACKEND_UNREACHABLE, backendErrors } from '../backend/backend-errors';
import { Connectivity, isOffline } from './connectivity';

describe('Connectivity', () => {
  afterEach(() => vi.restoreAllMocks());

  const goOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

  it('follows the online and offline events and counts the reconnections', () => {
    const connectivity = TestBed.inject(Connectivity);
    expect(connectivity.online()).toBe(true);
    expect(connectivity.reconnections()).toBe(0);

    window.dispatchEvent(new Event('offline'));
    expect(connectivity.online()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(connectivity.online()).toBe(true);
    expect(connectivity.reconnections()).toBe(1);
  });

  it('starts offline when the browser has no network', () => {
    goOffline();
    expect(isOffline()).toBe(true);
    expect(TestBed.inject(Connectivity).online()).toBe(false);
  });

  describe('error messages', () => {
    const networkError = () => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });

    async function apiErrorKey(response = networkError()): Promise<string> {
      const error = await firstValueFrom(toApiError(response)).catch((e: unknown) => e);
      return (error as CocApiHttpError).i18nKey;
    }

    it('say "offline" when a request failed for lack of network', async () => {
      goOffline();
      expect(await apiErrorKey()).toBe('errors.offline');
      // The service worker answers 504 when it has no saved copy.
      expect(await apiErrorKey(new HttpErrorResponse({ status: 504 }))).toBe('errors.offline');
      expect(backendErrors(networkError()).general).toEqual([{ key: BACKEND_OFFLINE }]);
    });

    it('keep "service unavailable" when the network is there', async () => {
      expect(await apiErrorKey()).toBe('errors.proxyUnreachable');
      expect(backendErrors(networkError()).general).toEqual([{ key: BACKEND_UNREACHABLE }]);
    });
  });
});
