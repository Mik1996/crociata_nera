import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { LanguageService } from '../i18n/language.service';

/** How often an open tab asks the server whether a new version was deployed. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60_000;

/**
 * New versions of the site, with the service worker.
 *
 * The service worker serves the cached version at once (also offline) and downloads a new deploy in
 * the background. When it is ready this service offers to reload ("Update"): the page keeps working
 * on the old version until then. A cached version that cannot be completed any more (files gone from
 * the server) asks for a reload as well. Checks run at startup, every
 * {@link UPDATE_CHECK_INTERVAL_MS} and when the tab comes back to the foreground.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly updates = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  start(): void {
    if (this.started || !this.updates.isEnabled) return;
    this.started = true;

    const ready = this.updates.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => this.offerReload('app.update.ready'));
    const broken = this.updates.unrecoverable.subscribe(() =>
      this.offerReload('app.update.broken'),
    );

    const check = () => void this.updates.checkForUpdate().catch(() => undefined);
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') check();
    };
    this.document.addEventListener('visibilitychange', onVisible);

    this.destroyRef.onDestroy(() => {
      ready.unsubscribe();
      broken.unsubscribe();
      clearInterval(interval);
      this.document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private offerReload(messageKey: string): void {
    this.snackBar
      .open(this.language.t(messageKey), this.language.t('app.update.reload'))
      .onAction()
      .subscribe(() => this.document.location.reload());
  }
}
