import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Icon } from '../../shared/icon/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { safeReturnUrl } from '../../core/backend/auth.guards';
import { AuthService } from '../../core/backend/auth.service';
import { BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { applyServerErrors, errorKey } from './auth-form';
import { AuthPanel } from './components/auth-panel';

/** Sign-in with email or username and password. */
@Component({
  selector: 'app-sign-in-page',
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
  templateUrl: './sign-in-page.html',
  styleUrl: './sign-in-page.scss',
})
export class SignInPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Page to go back to after signing in (query param, bound by the router). */
  readonly returnUrl = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    identifier: ['', [Validators.required, Validators.maxLength(254)]],
    password: ['', Validators.required],
  });

  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly generalErrors = signal<BackendMessage[]>([]);

  protected readonly errorKey = errorKey;
  protected readonly identifierErrors = {
    required: 'ERROR.IDENTIFIER_SHOULD_NOT_BE_EMPTY',
    maxlength: 'ERROR.INVALID_CREDENTIALS',
  };
  protected readonly passwordErrors = { required: 'ERROR.PASSWORD_SHOULD_NOT_BE_EMPTY' };

  protected submit(): void {
    this.generalErrors.set([]);
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { identifier, password } = this.form.getRawValue();
    this.auth.signIn({ identifier: identifier.trim(), password }).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.generalErrors.set([...applyServerErrors(this.form, fields), ...general]);
        this.submitting.set(false);
      },
    });
  }
}
