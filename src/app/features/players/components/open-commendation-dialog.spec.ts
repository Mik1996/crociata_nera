import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CHUNK_RELOAD_KEY } from '../../../core/pwa/chunk-load-error';
import { COMMENDATION_DIALOG_LOADER, CommendationDialogOpener } from './open-commendation-dialog';

@Component({ template: '' })
class FakeDialog {}

const chunkFailure = new TypeError(
  'Failed to fetch dynamically imported module: https://x/chunk-AB12CD34.js',
);

describe('CommendationDialogOpener', () => {
  function setup(load: () => Promise<unknown>, win?: unknown) {
    const dialog = { open: vi.fn() };
    const snackBar = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: COMMENDATION_DIALOG_LOADER, useValue: load },
        ...(win ? [{ provide: DOCUMENT, useValue: { defaultView: win } }] : []),
      ],
    });
    return { opener: TestBed.inject(CommendationDialogOpener), dialog, snackBar };
  }

  function fakeWindow(onLine: boolean) {
    const storage = new Map<string, string>();
    return {
      navigator: { onLine },
      location: { href: 'https://x/players/%23AAA', assign: vi.fn() },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    };
  }

  async function panelClassOf(data: Parameters<CommendationDialogOpener['open']>[0]) {
    const { opener, dialog } = setup(async () => FakeDialog);
    await opener.open(data);
    const [component, config] = dialog.open.mock.calls[0];
    expect(component).toBe(FakeDialog);
    expect(config.width).toBe('27.5rem');
    expect(config.maxWidth).toBe('calc(100vw - 2rem)');
    return config.panelClass as string[];
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

  it('reloads the page when the dialog code is gone after a deploy', async () => {
    const win = fakeWindow(true);
    const { opener, dialog, snackBar } = setup(() => Promise.reject(chunkFailure), win);
    await opener.open({ type: 'champion', tier: 'gold', count: 1 });
    expect(win.location.assign).toHaveBeenCalledWith('https://x/players/%23AAA');
    expect(win.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toContain('/players/');
    expect(dialog.open).not.toHaveBeenCalled();
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('tells the medal cannot be opened offline, or when the reload did not help', async () => {
    const offline = fakeWindow(false);
    const { opener, snackBar } = setup(() => Promise.reject(chunkFailure), offline);
    await opener.open({ type: 'champion', tier: 'gold', count: 1 });
    expect(offline.location.assign).not.toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Impossibile aprire la medaglia: controlla la connessione e riprova.',
      undefined,
      expect.objectContaining({ duration: expect.any(Number) }),
    );

    // Online, but the page was just reloaded for the same failure: no reload loop.
    const online = fakeWindow(true);
    online.sessionStorage.setItem(
      CHUNK_RELOAD_KEY,
      JSON.stringify({ url: online.location.href, at: Date.now() }),
    );
    TestBed.resetTestingModule();
    const again = setup(() => Promise.reject(chunkFailure), online);
    await again.opener.open({ type: 'champion', tier: 'gold', count: 1 });
    expect(online.location.assign).not.toHaveBeenCalled();
    expect(again.snackBar.open).toHaveBeenCalled();
  });
});
