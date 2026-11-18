import { cacheStartupScripts, loadedScripts } from './startup-scripts';

describe('startup scripts', () => {
  function fakeWindow(withWorker = true) {
    const listeners = new Map<string, () => void>();
    const serviceWorker = {
      addEventListener: vi.fn((type: string, listener: () => void) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    const win = {
      location: { href: 'https://crociatanera.it/players', origin: 'https://crociatanera.it' },
      navigator: withWorker ? { serviceWorker } : {},
      document: {
        scripts: [{ src: 'https://crociatanera.it/main-AB12.js' }, { src: '' }],
      },
      performance: {
        getEntriesByType: () => [
          { name: 'https://crociatanera.it/chunk-CD34.js' },
          { name: 'https://crociatanera.it/chunk-EF56.js' },
          { name: 'https://crociatanera.it/main-AB12.js' },
          { name: 'https://crociatanera.it/ngsw-worker.js' },
          { name: 'https://crociatanera.it/api/v1/welcome' },
          { name: 'https://crociatanera.it/media/intro.js' },
          { name: 'https://fonts.gstatic.com/inter.js' },
        ],
      },
      fetch: vi.fn().mockResolvedValue(new Response('')),
    };
    return { win: win as unknown as Window & typeof win, listeners };
  }

  it('lists the code files of the build the page loaded, once each', () => {
    const { win } = fakeWindow();
    expect(loadedScripts(win)).toEqual(['/main-AB12.js', '/chunk-CD34.js', '/chunk-EF56.js']);
  });

  it('requests them again once the service worker takes control of the page', async () => {
    const { win, listeners } = fakeWindow();
    cacheStartupScripts(win);
    expect(win.fetch).not.toHaveBeenCalled();

    listeners.get('controllerchange')!();
    expect(win.fetch.mock.calls.map(([url]) => url)).toEqual([
      '/main-AB12.js',
      '/chunk-CD34.js',
      '/chunk-EF56.js',
    ]);
    // Only the first change: the worker of an update does not need it.
    expect(listeners.has('controllerchange')).toBe(false);
  });

  it('ignores failed requests, stops listening on demand and needs a service worker', async () => {
    const { win, listeners } = fakeWindow();
    win.fetch.mockRejectedValue(new TypeError('offline'));
    cacheStartupScripts(win);
    listeners.get('controllerchange')!();
    await Promise.resolve();

    const other = fakeWindow();
    cacheStartupScripts(other.win)();
    expect(other.listeners.has('controllerchange')).toBe(false);

    expect(() => cacheStartupScripts(fakeWindow(false).win)()).not.toThrow();
  });
});
