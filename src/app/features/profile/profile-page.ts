import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { AuthService } from '../../core/backend/auth.service';
import { BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { LocalDatePipe } from '../../core/i18n/locale-pipes';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { roleKey } from '../../shared/labels';
import { applyServerErrors, errorKey, passwordsMatch, PLAYER_TAG_PATTERN, strongPassword } from '../auth/auth-form';

type Feedback = { kind: 'success' | 'error'; messages: BackendMessage[] } | null;

/** "My profile": account details, email verification, linked player tag, password change. */
@Component({
  selector: 'app-profile-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    LocalDatePipe,
    PageHeader,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly api = inject(CocApiService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly user = this.auth.user;
  protected readonly roleKey = roleKey;

  /** Clan members, to show which member the linked tag belongs to. */
  private readonly clan = rxResource({ stream: () => this.api.getClan().pipe(catchError(() => of(null))) });
  protected readonly linkedMember = computed(() => {
    const tag = this.auth.playerTag();
    const clan = this.clan.hasValue() ? this.clan.value() : null;
    return tag && clan ? (clan.members.find((m) => m.tag === tag) ?? null) : null;
  });

  // --- Email verification ------------------------------------------------------------
  protected readonly resending = signal(false);
  protected readonly verifyFeedback = signal<Feedback>(null);

  protected resendVerification(): void {
    this.resending.set(true);
    this.verifyFeedback.set(null);
    this.auth.resendVerification().subscribe({
      next: () => this.finish(this.resending, this.verifyFeedback, { kind: 'success', messages: [{ key: 'SUCCESS.VERIFICATION_EMAIL_SENT' }] }),
      error: (error: unknown) => this.finish(this.resending, this.verifyFeedback, { kind: 'error', messages: this.allMessages(error) }),
    });
  }

  // --- Player tag --------------------------------------------------------------------
  protected readonly tagForm = this.fb.group({
    playerTag: [this.auth.playerTag() ?? '', Validators.pattern(PLAYER_TAG_PATTERN)],
  });
  protected readonly savingTag = signal(false);
  protected readonly tagFeedback = signal<Feedback>(null);
  protected readonly errorKey = errorKey;
  protected readonly tagErrors = { pattern: 'ERROR.PLAYER_TAG_IS_NOT_VALID' };

  protected saveTag(): void {
    this.tagFeedback.set(null);
    if (this.tagForm.invalid || this.savingTag()) {
      this.tagForm.markAllAsTouched();
      return;
    }
    const raw = this.tagForm.getRawValue().playerTag.trim();
    const playerTag = raw ? raw.toUpperCase().replace(/^#?/, '#') : null;
    this.savingTag.set(true);
    this.auth.updateProfile({ playerTag }).subscribe({
      next: (user) => {
        this.tagForm.setValue({ playerTag: user.playerTag ?? '' });
        this.tagForm.markAsPristine();
        this.finish(this.savingTag, this.tagFeedback, { kind: 'success', messages: [{ key: 'SUCCESS.PROFILE_UPDATED' }] });
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        const rest = [...applyServerErrors(this.tagForm, fields), ...general];
        this.finish(this.savingTag, this.tagFeedback, rest.length ? { kind: 'error', messages: rest } : null);
      },
    });
  }

  // --- Password ----------------------------------------------------------------------
  protected readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      password: ['', [Validators.required, strongPassword]],
      repeatPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );
  protected readonly savingPassword = signal(false);
  protected readonly passwordFeedback = signal<Feedback>(null);
  protected readonly showPassword = signal(false);
  protected readonly passwordErrors = {
    currentPassword: { required: 'ERROR.PASSWORD_SHOULD_NOT_BE_EMPTY' },
    password: {
      required: 'ERROR.PASSWORD_SHOULD_NOT_BE_EMPTY',
      weak: 'ERROR.PASSWORD_IS_NOT_STRONG_ENOUGH',
      tooLong: 'ERROR.PASSWORD_IS_TOO_LONG',
    },
    repeatPassword: { required: 'ERROR.REPEAT_PASSWORD_SHOULD_NOT_BE_EMPTY', mismatch: 'ERROR.PASSWORDS_DO_NOT_MATCH' },
  };

  protected changePassword(): void {
    this.passwordFeedback.set(null);
    if (this.passwordForm.invalid || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    this.auth.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.finish(this.savingPassword, this.passwordFeedback, { kind: 'success', messages: [{ key: 'SUCCESS.PASSWORD_UPDATED' }] });
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        const rest = [...applyServerErrors(this.passwordForm, fields), ...general];
        this.finish(this.savingPassword, this.passwordFeedback, rest.length ? { kind: 'error', messages: rest } : null);
      },
    });
  }

  private finish(busy: { set(v: boolean): void }, feedback: { set(v: Feedback): void }, value: Feedback): void {
    feedback.set(value);
    busy.set(false);
  }

  private allMessages(error: unknown): BackendMessage[] {
    const { fields, general } = backendErrors(error);
    return [...general, ...fields];
  }
}
