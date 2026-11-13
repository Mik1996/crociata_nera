import { MatDialog } from '@angular/material/dialog';
import { openCommendationDialog } from './open-commendation-dialog';

describe('openCommendationDialog', () => {
  async function panelClassOf(data: Parameters<typeof openCommendationDialog>[1]) {
    const open = vi.fn();
    await openCommendationDialog({ open } as unknown as MatDialog, data);
    return open.mock.calls[0][1].panelClass as string[];
  }

  it('dresses the dialog in the crimson of a legendary commendation', async () => {
    expect(await panelClassOf({ type: 'cwlAllAttacks', tier: 'legendary', count: 1 })).toEqual([
      'cn-medal-dialog',
      'cn-medal-dialog--legendary',
    ]);
  });

  it('keeps the grey of a medal not earned yet, whatever its tier', async () => {
    expect(await panelClassOf({ type: 'cwlAllAttacks', tier: 'legendary', count: 0 })).toEqual([
      'cn-medal-dialog',
      'cn-medal-dialog--locked',
    ]);
  });
});
