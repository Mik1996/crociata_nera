/** Languages supported by the UI (BCP 47 codes, also used as translation file names). */
export type LanguageCode = 'it-IT' | 'en-US' | 'es-ES';

export interface Language {
  code: LanguageCode;
  /** Language name written in the language itself. */
  name: string;
  /** Flag in `public/flags/`. */
  flag: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'it-IT', name: 'Italiano', flag: 'flags/it.svg' },
  { code: 'en-US', name: 'English', flag: 'flags/us.svg' },
  { code: 'es-ES', name: 'Español', flag: 'flags/es.svg' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'it-IT';

export const LANGUAGE_STORAGE_KEY = 'crociata-nera.language';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

/**
 * Search engine crawlers (Googlebot presents itself as an English browser). They get Italian, the
 * clan's language, so the search results show the Italian titles and texts.
 */
const CRAWLER =
  /googlebot|google-inspectiontool|bingbot|duckduckbot|yandexbot|applebot|baiduspider|slurp|crawler|spider/i;

/**
 * Picks the initial language: the saved one, otherwise Italian for search engine crawlers, otherwise
 * the first supported browser language (prefix match too: `en-GB` → `en-US`), otherwise Italian.
 */
export function initialLanguage(
  saved: string | null,
  browserPreferences: readonly string[],
  userAgent = '',
): LanguageCode {
  if (isLanguageCode(saved)) return saved;
  if (CRAWLER.test(userAgent)) return DEFAULT_LANGUAGE;
  for (const preference of browserPreferences) {
    const exact = LANGUAGES.find((l) => l.code.toLowerCase() === preference.toLowerCase());
    if (exact) return exact.code;
    const prefix = preference.split('-')[0].toLowerCase();
    const similar = LANGUAGES.find((l) => l.code.split('-')[0] === prefix);
    if (similar) return similar.code;
  }
  return DEFAULT_LANGUAGE;
}
