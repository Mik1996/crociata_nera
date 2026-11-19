import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { DefenseBasesService } from './defense-bases.service';

/** The count is read again this often while an administrator is signed in. */
export const PENDING_REFRESH_MS = 60_000;
/** After a failed read, the next attempt comes sooner. */
export const PENDING_RETRY_MS = 5_000;

/**
 * How many base proposals wait for review: the badges on the account button and next to "Base
 * moderation" in the account menu (administrators). Read as soon as an administrator's session is
 * confirmed ({@link start}: at sign-in and at every page load), then every minute, when the page
 * comes back to the foreground and each time the menu opens; a failed read is tried again after a
 * few seconds. The moderation page sets it after every list it reads.
 */
@Injectable({ providedIn: 'root' })
export class PendingBaseProposals {
  private readonly service = inject(DefenseBasesService);
  private readonly document = inject(DOCUMENT);
  private request?: Subscription;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  /** `0` until read, and after a sign-out. */
  readonly count = signal(0);

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
    this.count.set(0);
  }

  /** Reads the count again (only while started); on failure the last one stays. */
  refresh(): void {
    if (!this.running) return;
    this.request?.unsubscribe();
    this.clearTimer();
    this.request = this.service.pendingCount().subscribe({
      next: (count) => {
        this.count.set(count);
        this.schedule(PENDING_REFRESH_MS);
      },
      error: () => this.schedule(PENDING_RETRY_MS),
    });
  }

  set(count: number): void {
    this.count.set(count);
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
