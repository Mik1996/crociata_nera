import { NavigationError } from '@angular/router';
import { CHUNK_RELOAD_KEY, isChunkLoadError, reloadOnChunkLoadError } from './chunk-load-error';

describe('chunk load errors', () => {
  const failure = new TypeError(
    'Failed to fetch dynamically imported module: https://x/chunk-AB12CD34.js',
  );

  function fakeWindow(onLine = true) {
    const storage = new Map<string, string>();
    return {
      navigator: { onLine },
      location: { assign: vi.fn() },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    } as unknown as Window & { location: { assign: ReturnType<typeof vi.fn> } };
  }

  const navigationError = (error: unknown, url = '/players') => new NavigationError(1, url, error);

  it('recognises the dynamic import failures of the main browsers', () => {
    expect(isChunkLoadError(failure)).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot match any routes'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('loads the page again from the server, once', () => {
    const win = fakeWindow();
    reloadOnChunkLoadError(navigationError(failure), win);
    expect(win.location.assign).toHaveBeenCalledWith('/players');
    expect(win.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toContain('/players');

    reloadOnChunkLoadError(navigationError(failure), win);
    expect(win.location.assign).toHaveBeenCalledTimes(1);

    reloadOnChunkLoadError(navigationError(failure, '/wars'), win);
    expect(win.location.assign).toHaveBeenLastCalledWith('/wars');
  });

  it('does nothing offline or for other navigation errors', () => {
    const offline = fakeWindow(false);
    reloadOnChunkLoadError(navigationError(failure), offline);
    expect(offline.location.assign).not.toHaveBeenCalled();

    const online = fakeWindow();
    reloadOnChunkLoadError(navigationError(new Error('Guard failed')), online);
    expect(online.location.assign).not.toHaveBeenCalled();
  });
});
