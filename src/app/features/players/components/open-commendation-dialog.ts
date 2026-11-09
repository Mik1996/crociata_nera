import { MatDialog } from '@angular/material/dialog';
import type { CommendationDialogData } from './commendation-dialog';

/**
 * Opens a commendation medal in 3D. The dialog (and Three.js with it) is downloaded only now:
 * this file imports nothing heavy, so callers stay light.
 */
export async function openCommendationDialog(dialog: MatDialog, data: CommendationDialogData): Promise<void> {
  const { CommendationDialog } = await import('./commendation-dialog');
  // The border takes the colour of the medal (grey when not earned yet).
  const metal = data.count === 0 ? 'locked' : data.tier;
  dialog.open(CommendationDialog, {
    data,
    width: '440px',
    maxWidth: 'calc(100vw - 32px)',
    panelClass: ['cn-medal-dialog', `cn-medal-dialog--${metal}`],
    backdropClass: 'cn-medal-backdrop',
  });
}
