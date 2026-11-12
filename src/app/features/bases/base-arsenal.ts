import { inject, Injectable, Injector, signal, untracked } from '@angular/core';
import { pendingUntilEvent } from '@angular/core/rxjs-interop';
import { Observable, Subscription } from 'rxjs';
import { DefenseBase, DefenseBasePage } from '../../core/backend/backend-api.types';
import { DefenseBasesService } from '../../core/backend/defense-bases.service';

/**
 * The pages of the arsenal read so far for one filter, in order. Pages are asked for one at a time
 * ({@link loadMore}) and never twice: a call while a page is on its way, after the last page or
 * after an error does nothing ({@link retry} after an error).
 */
export class BaseFeed {
  /** Every base read so far, in the order of the backend (highest town hall first). */
  readonly items = signal<DefenseBase[]>([]);
  /** Town hall levels with at least one base, whatever the filter (from the latest page). */
  readonly townHallLevels = signal<number[]>([]);
  readonly loading = signal(false);
  readonly error = signal<unknown>(undefined);
  /** The last page has arrived (`nextCursor: null`): nothing more to ask for. */
  readonly complete = signal(false);

  private cursor: string | null = null;
  private request?: Subscription;

  constructor(
    private readonly loadPage: (cursor: string | null) => Observable<DefenseBasePage>,
    /** When the first page was asked for: the feed is read again from the start once stale. */
    readonly startedAt = Date.now(),
  ) {}

  /** A feed already complete, made of bases read by another feed (and as old as it). */
  static of(items: DefenseBase[], townHallLevels: number[], startedAt: number): BaseFeed {
    const feed = new BaseFeed(() => {
      throw new Error('A complete feed asks for no pages');
    }, startedAt);
    feed.items.set(items);
    feed.townHallLevels.set(townHallLevels);
    feed.complete.set(true);
    return feed;
  }

  /** Asks for the next page, unless one is on its way, the last one has arrived or the last failed. */
  loadMore(): void {
    if (this.loading() || this.complete() || this.error() !== undefined) return;
    this.loading.set(true);
    this.request = this.loadPage(this.cursor).subscribe({
      next: (page) => {
        // A base saved again meanwhile may come back: keep the copy already shown.
        const seen = new Set(this.items().map((base) => base.id));
        this.items.update((items) => [
          ...items,
          ...page.items.filter((base) => !seen.has(base.id)),
        ]);
        this.townHallLevels.set(page.townHallLevels);
        this.cursor = page.nextCursor;
        this.complete.set(page.nextCursor === null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error ?? new Error());
        this.loading.set(false);
      },
    });
  }

  /** Asks again for the page that failed. */
  retry(): void {
    this.error.set(undefined);
    this.loadMore();
  }

  /** Replaces a base already shown (same id). */
  replace(base: DefenseBase): void {
    this.items.update((items) => items.map((item) => (item.id === base.id ? base : item)));
  }

  /** Stops the page on its way, if any. */
  dispose(): void {
    this.request?.unsubscribe();
  }
}

/**
 * Pages of the arsenal already read, per town hall filter, kept for the whole visit: going back to
 * a filter (or to the page) shows what was read without asking for it again. Feeds older than
 * {@link MAX_AGE_MS} start over, so changes by other administrators show up within minutes; changes
 * made here start every feed over ({@link reset}) or update it in place ({@link replace}).
 */
@Injectable({ providedIn: 'root' })
export class BaseArsenal {
  static readonly MAX_AGE_MS = 2 * 60_000;

  private readonly service = inject(DefenseBasesService);
  private readonly injector = inject(Injector);
  private readonly feeds = new Map<number | null, BaseFeed>();
  /** Changed by {@link reset}: callers reading {@link feed} in a `computed` get the new feeds. */
  private readonly generation = signal(0);

  /** The feed of a filter (`null` = every town hall); its first page still has to be asked for. */
  feed(townHallLevel: number | null): BaseFeed {
    this.generation();
    return untracked(() => {
      const current = this.feeds.get(townHallLevel);
      if (current && !this.isStale(current)) return current;
      current?.dispose();
      const feed =
        this.fromAll(townHallLevel) ??
        // A page on its way keeps the application unstable (`whenStable()` waits for it).
        new BaseFeed((cursor) =>
          this.service.list(townHallLevel, cursor).pipe(pendingUntilEvent(this.injector)),
        );
      this.feeds.set(townHallLevel, feed);
      return feed;
    });
  }

  /** Forgets every page read: they are asked for again (after adding or deleting a base). */
  reset(): void {
    for (const feed of this.feeds.values()) feed.dispose();
    this.feeds.clear();
    this.generation.update((n) => n + 1);
  }

  /**
   * A base changed here: updated in place where it is shown, without reading the pages again. When
   * its town hall changes it belongs to another group and level filter, so everything is read again.
   */
  replace(base: DefenseBase): void {
    const shown = [...this.feeds.values()]
      .flatMap((feed) => feed.items())
      .find((b) => b.id === base.id);
    if (shown && shown.townHallLevel !== base.townHallLevel) return this.reset();
    for (const feed of this.feeds.values()) feed.replace(base);
  }

  /** With every base already read (and fresh), a level filter needs no request at all. */
  private fromAll(townHallLevel: number | null): BaseFeed | null {
    const all = townHallLevel === null ? undefined : this.feeds.get(null);
    if (!all?.complete() || this.isStale(all)) return null;
    const items = all.items().filter((base) => base.townHallLevel === townHallLevel);
    return BaseFeed.of(items, all.townHallLevels(), all.startedAt);
  }

  private isStale(feed: BaseFeed): boolean {
    return Date.now() - feed.startedAt > BaseArsenal.MAX_AGE_MS;
  }
}
