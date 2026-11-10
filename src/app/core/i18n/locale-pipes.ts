import { formatDate, formatNumber, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import localeIt from '@angular/common/locales/it';
import { inject, Pipe, PipeTransform } from '@angular/core';
import { LanguageService } from './language.service';

// Formatting data for the supported languages (en-US is already bundled with Angular).
registerLocaleData(localeIt);
registerLocaleData(localeEs);

/** Formats a number in a supported language (`'1.0-0'` digits format, as for `formatNumber`). */
export function formatLocalNumber(value: number, locale: string, format?: string): string {
  return formatNumber(value, locale, format);
}

/**
 * Like `number`, but formats with the language chosen by the user and updates on language change
 * (Angular's `LOCALE_ID` is fixed for the whole app lifetime).
 * Returns `null` for missing values, so `?? '0'` in templates keeps working.
 */
@Pipe({ name: 'localNumber', pure: false })
export class LocalNumberPipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: number | null | undefined, format?: string): string | null {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return formatLocalNumber(value, this.language.current(), format);
  }
}

/** Date formats defined in the translation files (`formats.*`), different per language. */
export type DateFormat = 'date' | 'dateTime';

/** Formats an ISO date with the current format and language. */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | number | Date | null | undefined, format: DateFormat = 'date'): string | null {
    if (value === null || value === undefined || value === '') return null;
    return formatDate(value, this.language.t(`formats.${format}`), this.language.current());
  }
}
