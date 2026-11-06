import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { applyServerErrors, errorKey } from './auth-form';
import { AuthPanel } from './components/auth-panel';

/** "Forgot password": asks for the email and sends a reset link. */
@Component({
  selector: 'app-forgot-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    AuthPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forgot-password-page.html',
  styleUrl: './forgot-password-page.scss',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });

  protected readonly submitting = signal(false);
  /** Address the link was sent to (shown in the confirmation). */
  protected readonly sentTo = signal<string | null>(null);
  protected readonly generalErrors = signal<BackendMessage[]>([]);

  protected readonly errorKey = errorKey;
  protected readonly emailErrors = {
    required: 'ERROR.EMAIL_SHOULD_NOT_BE_EMPTY',
    email: 'ERROR.EMAIL_MUST_BE_AN_EMAIL',
    maxlength: 'ERROR.EMAIL_MUST_BE_AN_EMAIL',
  };

  protected submit(): void {
    this.generalErrors.set([]);
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const email = this.form.getRawValue().email.trim();
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.sentTo.set(email);
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
