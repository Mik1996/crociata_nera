import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken, Type } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LanguageService } from '../../../core/i18n/language.service';
import { reloadForChunkLoadError } from '../../../core/pwa/chunk-load-error';
import type { CommendationDialogData } from './commendation-dialog';

/**
 * Downloads the 3D commendation dialog (and Three.js with it). A token so that tests can replace
 * the dynamic import.
 */
export const COMMENDATION_DIALOG_LOADER = new InjectionToken<() => Promise<Type<unknown>>>(
  'COMMENDATION_DIALOG_LOADER',
  {
    providedIn: 'root',
    factory: () => () => import('./commendation-dialog').then((m) => m.CommendationDialog),
  },
);

/** How long the "cannot open" message stays on screen. */
const ERROR_DURATION_MS = 6000;

/**
 * Opens a commendation medal in 3D. The dialog (and Three.js with it) is downloaded only now:
 * this file imports nothing heavy, so callers stay light.
 *
 * The download happens outside the router, so its failures are handled here: after a deploy a stale
 * tab no longer finds the old files and the page is loaded again (as for the pages' code); offline,
 * or when that did not help, a message says the medal cannot be opened.
 */
@Injectable({ providedIn: 'root' })
export class CommendationDialogOpener {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly load = inject(COMMENDATION_DIALOG_LOADER);

  async open(data: CommendationDialogData): Promise<void> {
    let component: Type<unknown>;
    try {
      component = await this.load();
    } catch (error) {
      const win = this.document.defaultView;
      if (!win || !reloadForChunkLoadError(error, win.location.href, win)) {
        this.snackBar.open(this.language.t('commendations.dialogUnavailable'), undefined, {
          duration: ERROR_DURATION_MS,
        });
      }
      return;
    }
    // The border takes the colour of the medal (grey when not earned yet).
    const metal = data.count === 0 ? 'locked' : data.tier;
    this.dialog.open(component, {
      data,
      width: '27.5rem',
      maxWidth: 'calc(100vw - 2rem)',
      panelClass: ['cn-medal-dialog', `cn-medal-dialog--${metal}`],
      backdropClass: 'cn-medal-backdrop',
    });
  }
}
