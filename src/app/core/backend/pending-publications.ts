import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { map, Subscription } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import { BaseResult, PublishingPendingCount } from './backend-api.types';

/** The count is read again this often while an administrator is signed in. */
export const PENDING_REFRESH_MS = 60_000;
/** After a failed read, the next attempt comes sooner. */
export const PENDING_RETRY_MS = 5_000;

const NONE: PublishingPendingCount = { bases: 0, announcements: 0 };

/**
 * What waits for an administrator on the Publications page: base proposals to review and
 * announcement drafts. The badges on the account button, next to "Publications" in the account
 * menu and on the tabs of the page. Read as soon as an administrator's session is confirmed
 * ({@link start}: at sign-in and at every page load), then every minute, when the page comes back
 * to the foreground and each time the menu opens; a failed read is tried again after a few seconds.
 * The tabs of the page set their part after every list they read.
 */
@Injectable({ providedIn: 'root' })
export class PendingPublications {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/admin/publishing/pending-count`;
  private readonly document = inject(DOCUMENT);
  private request?: Subscription;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  /** Zeros until read, and after a sign-out. */
  readonly counts = signal<PublishingPendingCount>(NONE);
  /** Everything waiting, for the badges of the menu. */
  readonly count = computed(() => this.counts().bases + this.counts().announcements);

  private readonly onVisible = () => {
    if (this.document.visibilityState === 'visible') this.refresh();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** An administrator's session is confirmed: read the count now and keep it current. */
  start(): void {
    if (!this.running) {
      this.running = true;
      this.document.addEventListener('visibilitychange', this.onVisible);
    }
    this.refresh();
  }

  /** Signed out (or not an administrator): no more reads, no badge. */
  stop(): void {
    this.running = false;
    this.document.removeEventListener('visibilitychange', this.onVisible);
    this.request?.unsubscribe();
    this.clearTimer();
    this.counts.set(NONE);
  }

  /** Reads the count again (only while started); on failure the last one stays. */
  refresh(): void {
    if (!this.running) return;
    this.request?.unsubscribe();
    this.clearTimer();
    this.request = this.http
      .get<BaseResult<PublishingPendingCount>>(this.url, { context: noCache() })
      .pipe(map((response) => response.result ?? NONE))
      .subscribe({
        next: (counts) => {
          this.counts.set(counts);
          this.schedule(PENDING_REFRESH_MS);
        },
        error: () => this.schedule(PENDING_RETRY_MS),
      });
  }

  /** A tab of the page read its list: its part of the count. */
  set(part: keyof PublishingPendingCount, count: number): void {
    this.counts.update((counts) => ({ ...counts, [part]: count }));
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (this.running) this.timer = setTimeout(() => this.refresh(), delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
