import { clearPrivateOfflineData } from './offline-data';

describe('clearPrivateOfflineData', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deletes only the caches of the clan data group', async () => {
    const names = [
      'ngsw:/:db:control',
      'ngsw:/:1:data:clan-data:cache',
      'ngsw:/:db:1:data:clan-data:lru',
      'ngsw:/:1:data:coc-api:cache',
      'ngsw:/:abc:assets:app:cache',
    ];
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => names,
      delete: async (name: string) => deleted.push(name) > 0,
    });

    await clearPrivateOfflineData();

    expect(deleted).toEqual(['ngsw:/:1:data:clan-data:cache', 'ngsw:/:db:1:data:clan-data:lru']);
  });

  it('ignores an unavailable Cache Storage', async () => {
    vi.stubGlobal('caches', { keys: () => Promise.reject(new Error('SecurityError')) });
    await expect(clearPrivateOfflineData()).resolves.toBeUndefined();
  });
});
