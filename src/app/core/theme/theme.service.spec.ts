import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';
import { THEME_STORAGE_KEY } from './themes';

/** Fake `matchMedia` for `(prefers-color-scheme: dark)` whose value can be changed from the test. */
function fakeSystemTheme(dark: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const query = {
    matches: dark,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
  return (value: boolean) => {
    query.matches = value;
    listeners.forEach((l) => l({ matches: value }));
  };
}

describe('ThemeService', () => {
  // jsdom has no matchMedia. The test files share one window, so the stub must be a valid
  // MediaQueryList (other code, e.g. the CDK BreakpointObserver behind tooltips, reads it)
  // and must be removed afterwards.
  let stubbed = false;

  beforeEach(() => {
    stubbed = typeof window.matchMedia !== 'function';
    if (stubbed) {
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    }
    localStorage.removeItem(THEME_STORAGE_KEY);
  });
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    vi.restoreAllMocks();
    if (stubbed) delete (window as { matchMedia?: unknown }).matchMedia;
  });

  const theme = () => document.documentElement.dataset['theme'];

  it('follows the system theme by default, also when it changes', () => {
    const setSystemDark = fakeSystemTheme(true);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.current()).toBe('dark');
    expect(theme()).toBe('dark');

    setSystemDark(false);
    TestBed.tick();
    expect(service.current()).toBe('light');
    expect(theme()).toBe('light');
  });

  it('applies and remembers the chosen theme, ignoring later system changes', () => {
    const setSystemDark = fakeSystemTheme(false);
    const service = TestBed.inject(ThemeService);
    service.use('dark');
    TestBed.tick();
    expect(theme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    setSystemDark(false);
    TestBed.tick();
    expect(service.current()).toBe('dark');
  });

  it('starts from the saved choice', () => {
    fakeSystemTheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(TestBed.inject(ThemeService).current()).toBe('light');
  });

  it('cross-fades the switch with a View Transition when available, unless motion is reduced', () => {
    fakeSystemTheme(false);
    const start = vi.fn((update: () => void) => update());
    Object.assign(document, { startViewTransition: start });
    try {
      const service = TestBed.inject(ThemeService);
      service.use('dark');
      expect(start).toHaveBeenCalledTimes(1);
      expect(theme()).toBe('dark');
      service.use('dark');
      expect(start).toHaveBeenCalledTimes(1); // no transition when nothing changes
    } finally {
      delete (document as Partial<Document>).startViewTransition;
    }
  });
});
