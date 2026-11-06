import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TitleStrategy } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { catchError, firstValueFrom, of } from 'rxjs';
import { LanguageService } from './language.service';
import { DEFAULT_LANGUAGE } from './languages';
import { PageTitleStrategy } from './page-title-strategy';
import { TranslatedPaginatorIntl } from './paginator-intl';

/**
 * Internationalisation with ngx-translate.
 * Translations live in `public/i18n/<code>.json` and are downloaded on demand;
 * startup waits for the initial language so keys are never shown instead of texts.
 */
export function provideI18n(): (Provider | EnvironmentProviders)[] {
  return [
    provideTranslateService({
      fallbackLang: DEFAULT_LANGUAGE,
      loader: provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }),
    }),
    provideAppInitializer(() => {
      const language = inject(LanguageService);
      return firstValueFrom(language.use(language.initial()).pipe(catchError(() => of(null))));
    }),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl },
  ];
}
