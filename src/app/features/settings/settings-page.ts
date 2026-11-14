import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '../../shared/icon/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../core/i18n/language.service';
import { LanguageCode } from '../../core/i18n/languages';
import { ThemeService } from '../../core/theme/theme.service';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';

/** Settings (public): theme and language, as large options that are easy to tap on phones. */
@Component({
  selector: 'app-settings-page',
  imports: [Icon, TranslatePipe, PageHeader, ScrollFade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly language = inject(LanguageService);

  protected changeLanguage(code: LanguageCode): void {
    if (code !== this.language.current()) this.language.use(code).subscribe();
  }
}
