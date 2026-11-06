import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable } from '@angular/core';
import { InterpolationParameters, TranslateService } from '@ngx-translate/core';
import { Observable, tap } from 'rxjs';
import {
  DEFAULT_LANGUAGE,
  initialLanguage,
  isLanguageCode,
  LANGUAGE_STORAGE_KEY,
  LANGUAGES,
  LanguageCode,
} from './languages';

/**
 * Current UI language, on top of ngx-translate.
 * Exposes the language as a signal, so `computed`s that build texts (charts, labels)
 * recompute by themselves when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  readonly languages = LANGUAGES;

  /** Code of the active language (e.g. `it-IT`), also used as locale for numbers and dates. */
  readonly current = computed<LanguageCode>(() => {
    const language = this.translate.currentLang();
    return isLanguageCode(language) ? language : DEFAULT_LANGUAGE;
  });

  readonly currentLanguage = computed(() => LANGUAGES.find((l) => l.code === this.current()) ?? LANGUAGES[0]);

  /** Language to use at startup (saved, browser or default). */
  initial(): LanguageCode {
    const preferences = this.document.defaultView?.navigator.languages ?? [];
    return initialLanguage(readSaved(), preferences);
  }

  /** Activates a language: loads the translations, remembers it and updates `<html lang>`. */
  use(code: LanguageCode): Observable<unknown> {
    return this.translate.use(code).pipe(
      tap(() => {
        this.document.documentElement.lang = code.split('-')[0];
        save(code);
      }),
    );
  }

  /** Instant translation that, when read inside a `computed`, updates on language change. */
  t(key: string, params?: InterpolationParameters): string {
    this.current();
    return this.translate.instant(key, params) as string;
  }
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(code: LanguageCode): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Storage unavailable (e.g. private browsing): the choice only lasts for the session.
  }
}
