import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Icon } from '../../shared/icon/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { applyServerErrors, errorKey, passwordsMatch, strongPassword } from './auth-form';
import { AuthPanel } from './components/auth-panel';

/** New password from the emailed link (`/reset-password?token=…`). */
@Component({
  selector: 'app-reset-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    Icon,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    AuthPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reset-password-page.html',
  styleUrl: './reset-password-page.scss',
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);

  /** One-time token from the link (query param, bound by the router). */
  readonly token = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      password: ['', [Validators.required, strongPassword]],
      repeatPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly submitting = signal(false);
  protected readonly done = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly generalErrors = signal<BackendMessage[]>([]);

  protected readonly errorKey = errorKey;
  protected readonly errors = {
    password: {
      required: 'ERROR.PASSWORD_SHOULD_NOT_BE_EMPTY',
      weak: 'ERROR.PASSWORD_IS_NOT_STRONG_ENOUGH',
      tooLong: 'ERROR.PASSWORD_IS_TOO_LONG',
    },
    repeatPassword: {
      required: 'ERROR.REPEAT_PASSWORD_SHOULD_NOT_BE_EMPTY',
      mismatch: 'ERROR.PASSWORDS_DO_NOT_MATCH',
    },
  };

  protected submit(): void {
    this.generalErrors.set([]);
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.auth.resetPassword({ token: this.token() ?? '', ...this.form.getRawValue() }).subscribe({
      next: () => {
        this.done.set(true);
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.generalErrors.set([...applyServerErrors(this.form, fields), ...general]);
        this.submitting.set(false);
      },
    });
  }
}
