import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-names';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { CLAN_CREST_URL, ClanBadge } from '../../core/api/clan-badge';
import { isTranslatableError } from '../../core/i18n/translatable-error';
import { LanguageService } from '../../core/i18n/language.service';
import { Connectivity } from '../../core/pwa/connectivity';

/**
 * Extracts a readable message from an unknown error.
 * `translate` resolves translation keys (API errors and the generic message).
 */
export function errorMessage(
  error: unknown,
  translate: (key: string, params?: object) => string,
): string {
  if (isTranslatableError(error)) return translate(error.i18nKey, error.i18nParams).trim();
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return translate('status.unexpectedError');
}

/**
 * Handles loading, error and empty states uniformly.
 * The projected content is shown only when data is available. In the error state, `retry` is also
 * emitted by itself when the network comes back.
 */
@Component({
  selector: 'crn-load-state',
  imports: [MatProgressSpinnerModule, Icon, MatButtonModule, TranslatePipe],
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
  /** Shown in the empty state only when neither the clan badge nor the clan logo loads. */
  readonly emptyIcon = input<IconName>('inbox');
  readonly retry = output<void>();

  private readonly language = inject(LanguageService);

  /** The empty states show the clan badge, else the clan logo (the icon is the last fallback). */
  protected readonly badgeUrl = inject(ClanBadge).url;
  protected readonly badgeFailed = signal(false);
  protected readonly crestUrl = CLAN_CREST_URL;
  protected readonly crestFailed = signal(false);

  constructor() {
    const connectivity = inject(Connectivity);
    let seen = connectivity.reconnections();
    effect(() => {
      const reconnections = connectivity.reconnections();
      if (reconnections === seen) return;
      seen = reconnections;
      if (untracked(this.error)) this.retry.emit();
    });
  }

  protected readonly errorText = computed(() =>
    errorMessage(this.error(), (key, params) =>
      this.language.t(key, params as Record<string, unknown>),
    ),
  );
}
