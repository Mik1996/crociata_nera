import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from '../../shared/icon/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AuthService } from '../../core/backend/auth.service';
import { backendErrors } from '../../core/backend/backend-errors';
import { AuthPanel } from './components/auth-panel';

/** Confirms the email address from the link (`/verify-email?token=…`) as soon as it opens. */
@Component({
  selector: 'crn-verify-email-page',
  imports: [RouterLink, MatButtonModule, Icon, MatProgressSpinnerModule, TranslatePipe, AuthPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-email-page.html',
  styleUrl: './verify-email-page.scss',
})
export class VerifyEmailPage {
  private readonly auth = inject(AuthService);

  readonly token = input<string>();

  protected readonly verification = rxResource({
    params: () => this.token(),
    stream: ({ params }) => (params ? this.auth.verifyEmail(params) : of(null)),
  });

  protected readonly errorKeys = computed(() => {
    const error = this.verification.error();
    if (!error) return [];
    const { fields, general } = backendErrors(error);
    return [...general, ...fields];
  });
  protected readonly isAuthenticated = this.auth.isAuthenticated;
}
