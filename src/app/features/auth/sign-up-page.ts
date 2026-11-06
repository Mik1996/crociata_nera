import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { safeReturnUrl } from '../../core/backend/auth.guards';
import { AuthService } from '../../core/backend/auth.service';
import { BackendMessage, SignUpRequest } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { applyServerErrors, errorKey, passwordsMatch, PLAYER_TAG_PATTERN, strongPassword, USERNAME_PATTERN } from './auth-form';
import { AuthPanel } from './components/auth-panel';

/** Account creation; on success the user is signed in. */
@Component({
  selector: 'app-sign-up-page',
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
  templateUrl: './sign-up-page.html',
  styleUrl: './sign-up-page.scss',
})
export class SignUpPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Page to go back to after signing up (query param, bound by the router). */
  readonly returnUrl = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
      password: ['', [Validators.required, strongPassword]],
      repeatPassword: ['', Validators.required],
      playerTag: ['', Validators.pattern(PLAYER_TAG_PATTERN)],
    },
    { validators: passwordsMatch },
  );

  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly generalErrors = signal<BackendMessage[]>([]);

  protected readonly errorKey = errorKey;
  protected readonly errors = {
    email: { required: 'ERROR.EMAIL_SHOULD_NOT_BE_EMPTY', email: 'ERROR.EMAIL_MUST_BE_AN_EMAIL', maxlength: 'ERROR.EMAIL_MUST_BE_AN_EMAIL' },
    username: { required: 'ERROR.USERNAME_SHOULD_NOT_BE_EMPTY', pattern: 'ERROR.USERNAME_IS_NOT_VALID' },
    password: {
      required: 'ERROR.PASSWORD_SHOULD_NOT_BE_EMPTY',
      weak: 'ERROR.PASSWORD_IS_NOT_STRONG_ENOUGH',
      tooLong: 'ERROR.PASSWORD_IS_TOO_LONG',
    },
    repeatPassword: { required: 'ERROR.REPEAT_PASSWORD_SHOULD_NOT_BE_EMPTY', mismatch: 'ERROR.PASSWORDS_DO_NOT_MATCH' },
    playerTag: { pattern: 'ERROR.PLAYER_TAG_IS_NOT_VALID' },
  };

  protected submit(): void {
    this.generalErrors.set([]);
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.auth.signUp(this.request()).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.generalErrors.set([...applyServerErrors(this.form, fields), ...general]);
        this.submitting.set(false);
      },
    });
  }

  private request(): SignUpRequest {
    const { email, username, password, repeatPassword, playerTag } = this.form.getRawValue();
    const tag = playerTag.trim().toUpperCase().replace(/^#?/, '#');
    return {
      email: email.trim(),
      username: username.trim(),
      password,
      repeatPassword,
      ...(playerTag.trim() ? { playerTag: tag } : {}),
    };
  }
}
