import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as welcome } from '@/app/api/v1/welcome/route';
import { CocApiError } from '@/lib/coc/coc-client';
import {
  cachedRead,
  FAILURE_TTL_MS,
  isOutage,
  liveCacheSize,
  MAX_STALE_MS,
} from '@/lib/coc/live-cache';
import { call } from './helpers';

const TTL = 60_000;
const outage = () => new CocApiError(503, 'inMaintenance', 'maintenance');
const notFound = () => new CocApiError(404, 'notFound', 'not found');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('live cache of the Clash of Clans API', () => {
  it('keeps a response for its time to live, then reads again', async () => {
    const read = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    expect(await cachedRead('k', TTL, read)).toBe('first');
    vi.advanceTimersByTime(TTL - 1);
    expect(await cachedRead('k', TTL, read)).toBe('first');
    vi.advanceTimersByTime(1);
    expect(await cachedRead('k', TTL, read)).toBe('second');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('shares one call among concurrent requests', async () => {
    let resolve!: (value: string) => void;
    const read = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const requests = [
      cachedRead('k', TTL, read),
      cachedRead('k', TTL, read),
      cachedRead('k', TTL, read),
    ];
    resolve('value');
    expect(await Promise.all(requests)).toEqual(['value', 'value', 'value']);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('remembers a failure briefly and rethrows the same error', async () => {
    const error = outage();
    const read = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('back');
    await expect(cachedRead('k', TTL, read)).rejects.toBe(error);
    vi.advanceTimersByTime(FAILURE_TTL_MS - 1);
    await expect(cachedRead('k', TTL, read)).rejects.toBe(error);
    expect(read).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await cachedRead('k', TTL, read)).toBe('back');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('serves the last response during an outage, up to the maximum staleness', async () => {
    const read = vi.fn().mockResolvedValueOnce('old').mockRejectedValue(outage());
    expect(await cachedRead('k', TTL, read)).toBe('old');

    vi.advanceTimersByTime(TTL);
    expect(await cachedRead('k', TTL, read)).toBe('old');
    // The failure is remembered: no new call while it lasts, still the old response.
    expect(await cachedRead('k', TTL, read)).toBe('old');
    expect(read).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(MAX_STALE_MS - 1);
    expect(await cachedRead('k', TTL, read)).toBe('old');
    vi.advanceTimersByTime(FAILURE_TTL_MS);
    await expect(cachedRead('k', TTL, read)).rejects.toBeInstanceOf(CocApiError);
  });

  it('does not hide a definite answer behind the last response', async () => {
    const read = vi.fn().mockResolvedValueOnce('player').mockRejectedValue(notFound());
    await cachedRead('k', TTL, read);
    vi.advanceTimersByTime(TTL);
    await expect(cachedRead('k', TTL, read)).rejects.toMatchObject({ status: 404 });
    await expect(cachedRead('k', TTL, read)).rejects.toMatchObject({ status: 404 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('tells outages from definite answers', () => {
    expect(isOutage(new CocApiError(0, 'network', 'timeout'))).toBe(true);
    expect(isOutage(new CocApiError(429, 'requestThrottled', ''))).toBe(true);
    expect(isOutage(new CocApiError(500, 'unknown', ''))).toBe(true);
    expect(isOutage(new CocApiError(403, 'accessDenied.invalidIp', ''))).toBe(true);
    expect(isOutage(new CocApiError(403, 'accessDenied', ''))).toBe(false);
    expect(isOutage(notFound())).toBe(false);
    expect(isOutage(new Error('bug'))).toBe(false);
  });

  it('removes entries that can no longer be served', async () => {
    for (let i = 0; i < 20; i++) await cachedRead(`player:${i}`, TTL, async () => i);
    expect(liveCacheSize()).toBe(20);
    vi.advanceTimersByTime(TTL + MAX_STALE_MS);
    await cachedRead('other', TTL, async () => 'x');
    expect(liveCacheSize()).toBe(1);
  });

  it('answers /welcome with the last clan read while the API is down', async () => {
    let down = false;
    const clan = { tag: '#2J8JVVCLC', name: 'Crociata Nera', memberList: [] };
    const fetchMock = vi.fn(async () =>
      down
        ? new Response(JSON.stringify({ reason: 'inMaintenance' }), { status: 503 })
        : new Response(JSON.stringify(clan), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await call(welcome, {});
    expect(first.status).toBe(200);
    down = true;
    vi.advanceTimersByTime(10 * 60_000);
    const calls = fetchMock.mock.calls.length;
    const second = await call(welcome, {});
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it('answers 502 when the API is down and nothing was read before', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ reason: 'inMaintenance' }), { status: 503 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect((await call(welcome, {})).status).toBe(502);
    const calls = fetchMock.mock.calls.length;
    expect((await call(welcome, {})).status).toBe(502);
    // The failure is remembered: no new call to the API.
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
