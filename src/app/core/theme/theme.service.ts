import { DOCUMENT } from '@angular/common';
import { ApplicationRef, computed, effect, inject, Injectable, signal } from '@angular/core';
import { AVAILABLE_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, ThemeName } from './themes';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Current color theme.
 * Uses `DEFAULT_THEME` until the user picks another available theme; the choice is then remembered
 * (a saved theme that no longer exists falls back to the default).
 * The theme is applied as `<html data-theme="<name>">`, which switches the CSS tokens in `styles.scss`.
 * Theme changes cross-fade with a View Transition (300 ms ease-out, see `styles.scss`) where supported,
 * unless the user prefers reduced motion.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);

  readonly themes = inject(AVAILABLE_THEMES);
  /** Whether the user can choose a theme (the pickers are shown only with two or more themes). */
  readonly selectable = this.themes.length > 1;

  private readonly chosen = signal<ThemeName>(this.readSaved() ?? DEFAULT_THEME);

  readonly current = this.chosen.asReadonly();
  readonly currentOption = computed(
    () => this.themes.find((t) => t.name === this.current()) ?? this.themes[0],
  );

  constructor() {
    effect(() => this.applyToDocument(this.current()));
  }

  /** Applies a theme and remembers the choice. */
  use(theme: ThemeName): void {
    if (theme === this.current() || !this.isAvailable(theme)) return;
    save(theme);
    this.withTransition(() => this.chosen.set(theme));
  }

  private isAvailable(value: unknown): value is ThemeName {
    return this.themes.some((t) => t.name === value);
  }

  private readSaved(): ThemeName | null {
    try {
      const value = localStorage.getItem(THEME_STORAGE_KEY);
      return this.isAvailable(value) ? value : null;
    } catch {
      return null;
    }
  }

  private applyToDocument(theme: ThemeName): void {
    this.document.documentElement.dataset['theme'] = theme;
    // Browser UI colour = the theme background, read from the palette once the theme applies.
    const view = this.document.defaultView;
    const color = view?.getComputedStyle(this.document.documentElement).getPropertyValue('--cn-bg').trim();
    if (color) this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
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

function save(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (e.g. private browsing): the choice lasts for this session only.
  }
}
