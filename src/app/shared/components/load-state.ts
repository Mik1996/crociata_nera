import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { ClanBadge } from '../../core/api/clan-badge';
import { isTranslatableError } from '../../core/i18n/translatable-error';
import { LanguageService } from '../../core/i18n/language.service';

/**
 * Extracts a readable message from an unknown error.
 * `translate` resolves translation keys (API errors and the generic message).
 */
export function errorMessage(error: unknown, translate: (key: string, params?: object) => string): string {
  if (isTranslatableError(error)) return translate(error.i18nKey, error.i18nParams).trim();
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return translate('status.unexpectedError');
}

/**
 * Handles loading, error and empty states uniformly.
 * The projected content is shown only when data is available.
 */
@Component({
  selector: 'app-load-state',
  imports: [MatProgressSpinnerModule, MatIconModule, MatButtonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './load-state.html',
  styleUrl: './load-state.scss',
})
export class LoadState {
  readonly loading = input(false);
  readonly error = input<unknown>(undefined);
  readonly empty = input(false);
  /** Already translated texts; when missing, the generic messages of the current language are used. */
  readonly loadingMessage = input<string>();
  readonly emptyMessage = input<string>();
  /** Shown in the empty state only when the clan badge is not available. */
  readonly emptyIcon = input('inbox');
  readonly retry = output<void>();

  private readonly language = inject(LanguageService);

  /** The empty states show the clan badge (the icon is the fallback). */
  protected readonly badgeUrl = inject(ClanBadge).url;
  protected readonly badgeFailed = signal(false);
  protected readonly errorText = computed(() =>
    errorMessage(this.error(), (key, params) => this.language.t(key, params as Record<string, unknown>)),
  );
}
