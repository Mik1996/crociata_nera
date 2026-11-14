import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** `true` when the browser knows it has no network (a `true` online state is only a guess). */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Network state of the browser: `online` follows the `online` / `offline` events, `reconnections`
 * counts the times the connection came back (what failed meanwhile can be loaded again).
 */
@Injectable({ providedIn: 'root' })
export class Connectivity {
  private readonly onlineState = signal(!isOffline());
  private readonly reconnectionCount = signal(0);

  readonly online = this.onlineState.asReadonly();
  readonly reconnections = this.reconnectionCount.asReadonly();

  constructor() {
    const win = inject(DOCUMENT).defaultView;
    if (!win) return;
    const goOnline = () => {
      this.onlineState.set(true);
      this.reconnectionCount.update((n) => n + 1);
    };
    const goOffline = () => this.onlineState.set(false);
    win.addEventListener('online', goOnline);
    win.addEventListener('offline', goOffline);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('online', goOnline);
      win.removeEventListener('offline', goOffline);
    });
  }
}
