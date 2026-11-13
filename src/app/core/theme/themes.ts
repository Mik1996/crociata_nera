import { InjectionToken } from '@angular/core';

/**
 * Color themes of the interface.
 *
 * To add a theme:
 * 1. add its name here and an entry to `THEMES`;
 * 2. add its colour tokens in `src/styles/_color-palette.scss` (a `theme-tokens-<name>` mixin with
 *    the same token names as `theme-tokens-iron`) and its shapes and fonts (a `theme-shapes-<name>`
 *    mixin in `src/styles.scss`), both applied there to `:root[data-theme='<name>']`;
 * 3. add the label key `theme.<name>` to the three files `public/i18n/*.json`;
 * 4. add the name to the list in the inline script of `src/index.html`.
 * The theme pickers (header and Settings) appear automatically when there are two or more themes.
 */
export type ThemeName = 'iron' | 'steel';

export interface ThemeOption {
  name: ThemeName;
  /** Translation key of the theme label. */
  labelKey: string;
  /** CSS colour of the dot shown next to the label in the theme pickers (a palette token). */
  swatch: string;
}

export const THEMES: readonly ThemeOption[] = [
  // Ferro: black iron, gold and fire, the look of the welcome page.
  { name: 'iron', labelKey: 'theme.iron', swatch: 'var(--cn-theme-swatch-iron)' },
  // Acciaio: the gunmetal look the site had before.
  { name: 'steel', labelKey: 'theme.steel', swatch: 'var(--cn-theme-swatch-steel)' },
];

/** Theme used when the user has not chosen one (or the saved one no longer exists). */
export const DEFAULT_THEME: ThemeName = 'iron';

/** Themes offered to the user (a token, so tests can provide more than one). */
export const AVAILABLE_THEMES = new InjectionToken<readonly ThemeOption[]>('AVAILABLE_THEMES', {
  providedIn: 'root',
  factory: () => THEMES,
});

/**
 * localStorage key of the explicit choice. Keep in sync with the inline script in `src/index.html`,
 * which applies the theme before the app boots.
 */
export const THEME_STORAGE_KEY = 'crociata-nera.theme';
