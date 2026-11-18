import { effect, inject, Injectable, Provider } from '@angular/core';
import {
    DateAdapter,
    MAT_DATE_FORMATS,
    MAT_DATE_LOCALE,
    MAT_NATIVE_DATE_FORMATS,
    NativeDateAdapter,
} from '@angular/material/core';
import { LanguageService } from '../../../core/i18n/language.service';

/**
 * Native dates for the Material date pickers, in the language of the site: typed dates are read
 * in the order of the language (`17/11/2026` in Italian and Spanish, `11/17/2026` in English),
 * which `Date.parse` does not know.
 */
@Injectable()
export class LocaleDateAdapter extends NativeDateAdapter {
  constructor() {
    super();
    const language = inject(LanguageService);
    effect(() => this.setLocale(language.current()));
  }

  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value === 'string') {
      const day = parseLocalDay(value, String(this.locale));
      if (day !== undefined) return day;
    }
    return super.parse(value, parseFormat);
  }
}

/**
 * Day written with numbers (`d/m/yyyy`, `-` and `.` too) in the order of the locale; `null` when
 * the numbers make no valid day, `undefined` when the text is not written that way.
 */
export function parseLocalDay(text: string, locale: string): Date | null | undefined {
  const match = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(text);
  if (!match) return undefined;
  const monthFirst = locale.startsWith('en-US');
  const day = Number(monthFirst ? match[2] : match[1]);
  const month = Number(monthFirst ? match[1] : match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

/** Providers of the date pickers of a component. */
export function provideLocaleDateAdapter(): Provider[] {
  return [
    { provide: DateAdapter, useClass: LocaleDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
    {
      provide: MAT_DATE_LOCALE,
      useFactory: () => inject(LanguageService).current(),
    },
  ];
}
