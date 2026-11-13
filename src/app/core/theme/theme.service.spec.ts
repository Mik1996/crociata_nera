import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';
import { AVAILABLE_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, ThemeName, ThemeOption, THEMES } from './themes';

/** One more theme, to exercise the switching infrastructure whatever themes the site ships. */
const OTHER = 'other' as ThemeName;
const ONE_THEME: readonly ThemeOption[] = THEMES.slice(0, 1);
const TWO_THEMES: readonly ThemeOption[] = [
  ...ONE_THEME,
  { name: OTHER, labelKey: 'theme.other', swatch: '#ffffff' },
];

describe('ThemeService', () => {
  beforeEach(() => localStorage.removeItem(THEME_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY));

  const theme = () => document.documentElement.dataset['theme'];

  it('ships Ferro as the default theme and Acciaio as the alternative', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['iron', 'steel']);
    expect(DEFAULT_THEME).toBe('iron');
    expect(TestBed.inject(ThemeService).selectable).toBe(true);
  });

  it('applies the default theme and offers no choice with a single theme', () => {
    TestBed.configureTestingModule({ providers: [{ provide: AVAILABLE_THEMES, useValue: ONE_THEME }] });
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.current()).toBe(DEFAULT_THEME);
    expect(theme()).toBe(DEFAULT_THEME);
    expect(service.selectable).toBe(false);
  });

  it('ignores a saved theme that no longer exists (e.g. the old name of the gunmetal theme)', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(TestBed.inject(ThemeService).current()).toBe(DEFAULT_THEME);
  });

  describe('with more than one theme', () => {
    beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: AVAILABLE_THEMES, useValue: TWO_THEMES }] }));

    it('applies and remembers the chosen theme', () => {
      const service = TestBed.inject(ThemeService);
      expect(service.selectable).toBe(true);
      service.use(OTHER);
      TestBed.tick();
      expect(theme()).toBe(OTHER);
      expect(service.currentOption().name).toBe(OTHER);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(OTHER);
    });

    it('starts from the saved choice', () => {
      localStorage.setItem(THEME_STORAGE_KEY, OTHER);
      expect(TestBed.inject(ThemeService).current()).toBe(OTHER);
    });

    it('cross-fades the switch with a View Transition when available', () => {
      const start = vi.fn((update: () => void) => update());
      Object.assign(document, { startViewTransition: start });
      try {
        const service = TestBed.inject(ThemeService);
        service.use(OTHER);
        expect(start).toHaveBeenCalledTimes(1);
        expect(theme()).toBe(OTHER);
        service.use(OTHER);
        expect(start).toHaveBeenCalledTimes(1); // no transition when nothing changes
      } finally {
        delete (document as Partial<Document>).startViewTransition;
        TestBed.inject(ThemeService).use(DEFAULT_THEME);
      }
    });
  });
});
