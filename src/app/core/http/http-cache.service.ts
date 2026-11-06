import { HttpEvent, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

interface Entry {
  response: HttpResponse<unknown>;
  expiresAt: number;
}

/** Maximum number of cached responses (the oldest are dropped first). */
const MAX_ENTRIES = 200;

/**
 * In-memory store of GET responses, used by {@link cacheInterceptor}. Lives as long as the
 * tab: a page reload starts empty. Keys are full URLs including query parameters.
 */
@Injectable({ providedIn: 'root' })
export class HttpCacheService {
  private readonly entries = new Map<string, Entry>();
  /** GETs in flight, shared by identical concurrent requests (one network call). */
  readonly inFlight = new Map<string, Observable<HttpEvent<unknown>>>();
  /**
   * Bumped on every invalidation: a GET that started before an invalidation must not store
   * its (possibly stale) response afterwards.
   */
  private generation = 0;

  get currentGeneration(): number {
    return this.generation;
  }

  get(url: string, now = Date.now()): HttpResponse<unknown> | null {
    const entry = this.entries.get(url);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(url);
      return null;
    }
    return entry.response;
  }

  set(url: string, response: HttpResponse<unknown>, durationMs: number, generation: number, now = Date.now()): void {
    if (durationMs <= 0 || generation !== this.generation) return;
    this.entries.delete(url); // re-insert: Map order = age
    this.entries.set(url, { response, expiresAt: now + durationMs });
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
  }

  /** Drops cached responses whose URL starts with one of the prefixes (`''` = everything). */
  invalidate(...prefixes: string[]): void {
    this.generation++;
    for (const url of [...this.entries.keys()]) {
      if (prefixes.some((prefix) => url.startsWith(prefix))) this.entries.delete(url);
    }
  }

  /** Drops cached responses whose URL contains the given fragment (e.g. `/currentwar`). */
  invalidateMatching(fragment: string): void {
    this.generation++;
    for (const url of [...this.entries.keys()]) if (url.includes(fragment)) this.entries.delete(url);
  }

  clear(): void {
    this.invalidate('');
  }

  get size(): number {
    return this.entries.size;
  }
}
