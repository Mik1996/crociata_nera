import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
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
  template: `
    @if (loading()) {
      <div class="state" role="status" aria-live="polite">
        <mat-spinner diameter="44" [attr.aria-label]="'status.loading' | translate" />
        <p>{{ loadingMessage() ?? ('status.loading' | translate) }}</p>
      </div>
    } @else if (error()) {
      <div class="state state--error" role="alert">
        <mat-icon aria-hidden="true">error_outline</mat-icon>
        <p><strong>{{ 'status.errorTitle' | translate }}</strong></p>
        <p class="detail">{{ errorText() }}</p>
        <button mat-stroked-button type="button" (click)="retry.emit()">
          <mat-icon aria-hidden="true">refresh</mat-icon> {{ 'status.retry' | translate }}
        </button>
      </div>
    } @else if (empty()) {
      <div class="state state--empty" role="status">
        <mat-icon aria-hidden="true">{{ emptyIcon() }}</mat-icon>
        <p>{{ emptyMessage() ?? ('status.noData' | translate) }}</p>
      </div>
    } @else {
      <ng-content />
    }
  `,
  styles: `
    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 3rem 1rem;
      text-align: center;
      color: var(--cn-text-muted);
    }
    .state > mat-icon {
      font-size: 44px;
      width: 44px;
      height: 44px;
      color: var(--cn-gold);
    }
    .state--error > mat-icon {
      color: var(--cn-red-text);
    }
    .state p {
      margin: 0;
    }
    .detail {
      font-size: 0.9rem;
    }
    button {
      margin-top: 0.75rem;
    }
  `,
})
export class LoadState {
  readonly loading = input(false);
  readonly error = input<unknown>(undefined);
  readonly empty = input(false);
  /** Already translated texts; when missing, the generic messages of the current language are used. */
  readonly loadingMessage = input<string>();
  readonly emptyMessage = input<string>();
  readonly emptyIcon = input('inbox');
  readonly retry = output<void>();

  private readonly language = inject(LanguageService);
  protected readonly errorText = computed(() =>
    errorMessage(this.error(), (key, params) => this.language.t(key, params as Record<string, unknown>)),
  );
}
