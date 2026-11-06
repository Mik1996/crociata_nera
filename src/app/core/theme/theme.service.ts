import { DOCUMENT } from '@angular/common';
import { ApplicationRef, computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { isThemeName, THEME_COLORS, THEME_STORAGE_KEY, ThemeName, THEMES } from './themes';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Current color theme.
 * Follows the system preference until the user picks a theme; the choice is then remembered.
 * The theme is applied as `<html data-theme="light|dark">`, which switches the CSS tokens in `styles.scss`.
 * Theme changes cross-fade with a View Transition (300 ms ease-out, see `styles.scss`) where supported,
 * unless the user prefers reduced motion.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);
  private readonly media = this.document.defaultView?.matchMedia?.(DARK_QUERY) ?? null;

  readonly themes = THEMES;

  private readonly systemTheme = signal<ThemeName>(this.media?.matches ? 'dark' : 'light');
  /** Theme explicitly chosen by the user, or `null` to follow the system. */
  private readonly chosen = signal<ThemeName | null>(readSaved());

  readonly current = computed<ThemeName>(() => this.chosen() ?? this.systemTheme());
  readonly currentOption = computed(() => THEMES.find((t) => t.name === this.current()) ?? THEMES[0]);

  constructor() {
    if (this.media) {
      const onChange = (event: MediaQueryListEvent) =>
        this.withTransition(() => this.systemTheme.set(event.matches ? 'dark' : 'light'));
      this.media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onChange));
    }

    effect(() => this.applyToDocument(this.current()));
  }

  /** Applies a theme and remembers the choice. */
  use(theme: ThemeName): void {
    if (theme === this.current() && this.chosen() === theme) return;
    save(theme);
    this.withTransition(() => this.chosen.set(theme));
  }

  private applyToDocument(theme: ThemeName): void {
    this.document.documentElement.dataset['theme'] = theme;
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  }

  /**
   * Runs a theme state change inside a View Transition, so the old and new rendering cross-fade
   * (this also covers what CSS transitions cannot animate, like gradients and canvas charts).
   * The DOM is updated synchronously in the callback, as the API requires.
   */
  private withTransition(change: () => void): void {
    const update = () => {
      change();
      this.applyToDocument(this.current());
      this.appRef.tick(); // repaint components (e.g. chart colours) before the new snapshot
    };
    const reducedMotion = this.document.defaultView?.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
    if (typeof this.document.startViewTransition !== 'function' || reducedMotion) {
      update();
      return;
    }
    this.document.startViewTransition(update);
  }
}

function readSaved(): ThemeName | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(value) ? value : null;
  } catch {
    return null;
  }
}

function save(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (e.g. private browsing): the choice lasts for this session only.
  }
}
