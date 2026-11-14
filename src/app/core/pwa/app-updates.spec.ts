import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { LanguageService } from '../i18n/language.service';
import { AppUpdates, UPDATE_CHECK_INTERVAL_MS } from './app-updates';

describe('AppUpdates', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let checkForUpdate: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;
  let action: Subject<void>;
  let reload: ReturnType<typeof vi.fn>;
  let listeners: Map<string, () => void>;

  function setup(isEnabled = true) {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    checkForUpdate = vi.fn().mockResolvedValue(false);
    action = new Subject();
    open = vi.fn().mockReturnValue({ onAction: () => action });
    reload = vi.fn();
    listeners = new Map();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: { isEnabled, versionUpdates, unrecoverable, checkForUpdate },
        },
        { provide: MatSnackBar, useValue: { open } },
        { provide: LanguageService, useValue: { t: (key: string) => key } },
        {
          provide: DOCUMENT,
          useValue: {
            visibilityState: 'visible',
            location: { reload },
            addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
            removeEventListener: (type: string) => listeners.delete(type),
          },
        },
      ],
    });
    const updates = TestBed.inject(AppUpdates);
    updates.start();
    return updates;
  }

  afterEach(() => vi.useRealTimers());

  it('offers to reload when a new version is ready', () => {
    setup();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(open).not.toHaveBeenCalled();

    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });
    expect(open).toHaveBeenCalledWith('app.update.ready', 'app.update.reload');
    expect(reload).not.toHaveBeenCalled();

    action.next();
    expect(reload).toHaveBeenCalled();
  });

  it('asks for a reload when the cached version is broken', () => {
    setup();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing file' });
    expect(open).toHaveBeenCalledWith('app.update.broken', 'app.update.reload');
  });

  it('checks for updates periodically and when the tab comes back to the foreground', () => {
    vi.useFakeTimers();
    setup();
    expect(checkForUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    listeners.get('visibilitychange')!();
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a service worker', () => {
    setup(false);
    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });
    expect(open).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
