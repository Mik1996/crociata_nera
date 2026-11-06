/** Color themes of the interface. */
export type ThemeName = 'light' | 'dark';

export interface ThemeOption {
  name: ThemeName;
  /** Translation key of the theme label. */
  labelKey: string;
}

export const THEMES: readonly ThemeOption[] = [
  { name: 'light', labelKey: 'theme.light' },
  { name: 'dark', labelKey: 'theme.dark' },
];

/**
 * localStorage key of the explicit choice. Keep in sync with the inline script in `src/index.html`,
 * which applies the theme before the app boots.
 */
export const THEME_STORAGE_KEY = 'crociata-nera.theme';

/** Browser `theme-color` per theme (matches `--cn-bg`). */
export const THEME_COLORS: Record<ThemeName, string> = {
  light: '#e6d7b8',
  dark: '#0f1729',
};

export function isThemeName(value: unknown): value is ThemeName {
  return value === 'light' || value === 'dark';
}
