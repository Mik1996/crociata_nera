import { TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { DefenseBase, DefenseBasePage } from '../../core/backend/backend-api.types';
import { DefenseBasesService } from '../../core/backend/defense-bases.service';
import { BaseArsenal } from './base-arsenal';

const base = (id: string, townHallLevel = 18, description = ''): DefenseBase => ({
  id,
  townHallLevel,
  layoutUrl: '',
  description,
  clanCastleTroops: [],
  image: { key: id, width: 1, height: 1 },
  createdAt: '2026-11-12T10:00:00Z',
  updatedAt: '2026-11-12T10:00:00Z',
});
const page = (items: DefenseBase[], nextCursor: string | null): DefenseBasePage => ({
  items,
  nextCursor,
  townHallLevels: [18, 17],
});

describe('BaseArsenal', () => {
  /** Requests made, answered by the test through their subject. */
  let requests: {
    townHallLevel: number | null;
    cursor: string | null | undefined;
    reply: Subject<DefenseBasePage>;
  }[];
  let arsenal: BaseArsenal;

  function answer(index: number, value: DefenseBasePage): void {
    requests[index].reply.next(value);
    requests[index].reply.complete();
  }

  beforeEach(() => {
    requests = [];
    const list = vi.fn((townHallLevel: number | null, cursor?: string | null) => {
      const reply = new Subject<DefenseBasePage>();
      requests.push({ townHallLevel, cursor, reply });
      return reply;
    });
    TestBed.configureTestingModule({
      providers: [{ provide: DefenseBasesService, useValue: { list } }],
    });
    arsenal = TestBed.inject(BaseArsenal);
  });

  afterEach(() => vi.useRealTimers());

  it('asks for one page at a time, with the cursor of the previous one, until the last', () => {
    const feed = arsenal.feed(null);
    feed.loadMore();
    feed.loadMore(); // already on its way: not asked twice
    expect(requests).toHaveLength(1);
    expect(feed.loading()).toBe(true);

    answer(0, page([base('a'), base('b')], 'c1'));
    expect(feed.items().map((b) => b.id)).toEqual(['a', 'b']);
    expect(feed.townHallLevels()).toEqual([18, 17]);
    expect(feed.complete()).toBe(false);

    feed.loadMore();
    expect(requests[1].cursor).toBe('c1');
    // A base seen already (saved again meanwhile) is not shown twice.
    answer(1, page([base('b'), base('c', 17)], null));
    expect(feed.items().map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(feed.complete()).toBe(true);

    feed.loadMore(); // after the last page: nothing more is asked for
    expect(requests).toHaveLength(2);
  });

  it('stops after an error until asked to retry the same page', () => {
    const feed = arsenal.feed(null);
    feed.loadMore();
    answer(0, page([base('a')], 'c1'));
    feed.loadMore();
    requests[1].reply.error(new Error('offline'));
    expect(feed.error()).toBeInstanceOf(Error);

    feed.loadMore();
    expect(requests).toHaveLength(2);
    feed.retry();
    expect(requests[2].cursor).toBe('c1');
    expect(feed.error()).toBeUndefined();
  });

  it('keeps the pages read for each filter until they are stale', () => {
    vi.useFakeTimers();
    const all = arsenal.feed(null);
    all.loadMore();
    answer(0, page([base('a')], 'c1'));
    const th17 = arsenal.feed(17);
    expect(th17).not.toBe(all);

    // Back to every town hall: the same pages, nothing asked again.
    expect(arsenal.feed(null)).toBe(all);
    expect(arsenal.feed(null).items()).toHaveLength(1);

    vi.advanceTimersByTime(BaseArsenal.MAX_AGE_MS + 1);
    const fresh = arsenal.feed(null);
    expect(fresh).not.toBe(all);
    expect(fresh.items()).toEqual([]);
  });

  it('filters a town hall from every base already read, without asking', () => {
    const all = arsenal.feed(null);
    all.loadMore();
    answer(0, page([base('a', 18), base('b', 17), base('c', 17)], null));

    const th17 = arsenal.feed(17);
    expect(th17.items().map((b) => b.id)).toEqual(['b', 'c']);
    expect(th17.complete()).toBe(true);
    th17.loadMore();
    expect(requests).toHaveLength(1);
  });

  it('asks a town hall for its own pages while the list of every base is not complete', () => {
    arsenal.feed(null).loadMore();
    answer(0, page([base('a', 18)], 'c1'));
    arsenal.feed(17).loadMore();
    expect(requests[1]).toMatchObject({ townHallLevel: 17, cursor: null });
  });

  it('updates an edited base in place, and reads everything again when its town hall changes', () => {
    const feed = arsenal.feed(null);
    feed.loadMore();
    answer(0, page([base('a', 18), base('b', 17)], null));

    arsenal.replace(base('a', 18, 'New notes'));
    expect(arsenal.feed(null)).toBe(feed);
    expect(feed.items()[0].description).toBe('New notes');

    arsenal.replace(base('a', 16));
    expect(arsenal.feed(null)).not.toBe(feed);
  });

  it('forgets every page after a reset and stops the page on its way', () => {
    const feed = arsenal.feed(null);
    feed.loadMore();
    arsenal.reset();
    expect(requests[0].reply.observed).toBe(false);
    expect(arsenal.feed(null)).not.toBe(feed);
  });

  it('reports an error even when the request fails without one', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DefenseBasesService, useValue: { list: () => throwError(() => undefined) } },
      ],
    });
    const feed = TestBed.inject(BaseArsenal).feed(null);
    feed.loadMore();
    expect(feed.error()).toBeDefined();
    expect(feed.loading()).toBe(false);
  });
});
