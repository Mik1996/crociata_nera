import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  FormGroupDirective,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Icon } from '../../shared/icon/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { injectSisterClans } from '../../core/api/sister-clans';
import { AuthService } from '../../core/backend/auth.service';
import { BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { LocalDatePipe } from '../../core/i18n/locale-pipes';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { roleKey } from '../../shared/labels';
import {
  applyServerErrors,
  errorKey,
  passwordsMatch,
  PLAYER_TAG_PATTERN,
  strongPassword,
} from '../auth/auth-form';

/** Most accounts a user can link (same limit as the backend). */
const MAX_LINKED_PLAYERS = 10;

type Feedback = { kind: 'success' | 'error'; messages: BackendMessage[] } | null;

/** "My profile": account details, email verification, linked player tag, password change. */
@Component({
  selector: 'app-profile-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    Icon,
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
  /** Without it the clans' pages are closed: the page explains how to get access. */
  protected readonly hasClanAccess = this.auth.hasClanAccess;
  protected readonly roleKey = roleKey;

  /** Crociata Nera and its sister clans, to show which member each linked account belongs to. */
  private readonly clan = rxResource({
    stream: () => this.api.getClan().pipe(catchError(() => of(null))),
  });
  private readonly sisterClans = injectSisterClans();
  /**
   * Linked accounts with the clan member they belong to and its clan (`null` if the account is in
   * none of the three clans now).
   */
  protected readonly linkedPlayers = computed(() => {
    const main = this.clan.hasValue() ? this.clan.value() : null;
    const clans = [...(main ? [main] : []), ...this.sisterClans().map((s) => s.clan)];
    return this.auth.linkedPlayers().map((player) => {
      const clan = clans.find((c) => c.members.some((m) => m.tag === player.tag));
      const member = clan?.members.find((m) => m.tag === player.tag) ?? null;
      return { ...player, member, clanName: clan?.name ?? null };
    });
  });
  protected readonly maxPlayers = MAX_LINKED_PLAYERS;

  // --- Email verification ------------------------------------------------------------
  protected readonly resending = signal(false);
  protected readonly verifyFeedback = signal<Feedback>(null);

  protected resendVerification(): void {
    this.resending.set(true);
    this.verifyFeedback.set(null);
    this.auth.resendVerification().subscribe({
      next: () =>
        this.finish(this.resending, this.verifyFeedback, {
          kind: 'success',
          messages: [{ key: 'SUCCESS.VERIFICATION_EMAIL_SENT' }],
        }),
      error: (error: unknown) =>
        this.finish(this.resending, this.verifyFeedback, {
          kind: 'error',
          messages: this.allMessages(error),
        }),
    });
  }

  // --- Player link -------------------------------------------------------------------
  /**
   * Each account is linked only with its in-game API token (Settings → More Settings), which only
   * its owner can read: nobody can claim someone else's player. The form starts with an old
   * unverified link, if any, so only the token is missing.
   */
  protected readonly tagForm = this.fb.group({
    playerTag: [
      this.auth.linkedPlayers().find((p) => !p.verified)?.tag ?? '',
      [Validators.required, Validators.pattern(PLAYER_TAG_PATTERN)],
    ],
    token: ['', Validators.required],
  });
  protected readonly savingTag = signal(false);
  protected readonly tagFeedback = signal<Feedback>(null);
  protected readonly errorKey = errorKey;
  protected readonly tagErrors = {
    playerTag: {
      required: 'ERROR.PLAYER_TAG_IS_NOT_VALID',
      pattern: 'ERROR.PLAYER_TAG_IS_NOT_VALID',
    },
    token: { required: 'ERROR.PLAYER_TOKEN_SHOULD_NOT_BE_EMPTY' },
  };

  protected linkPlayer(formDirective: FormGroupDirective): void {
    this.tagFeedback.set(null);
    if (this.tagForm.invalid || this.savingTag()) {
      this.tagForm.markAllAsTouched();
      return;
    }
    const { playerTag, token } = this.tagForm.getRawValue();
    this.savingTag.set(true);
    this.auth
      .linkPlayer(playerTag.trim().toUpperCase().replace(/^#?/, '#'), token.trim())
      .subscribe({
        next: () => {
          // Clean form: empty, untouched, pristine and not "submitted" (no red required errors).
          formDirective.resetForm({ playerTag: '', token: '' });
          this.finish(this.savingTag, this.tagFeedback, {
            kind: 'success',
            messages: [{ key: 'SUCCESS.PLAYER_LINKED' }],
          });
        },
        error: (error: unknown) => {
          const { fields, general } = backendErrors(error);
          const rest = [...applyServerErrors(this.tagForm, fields), ...general];
          this.finish(
            this.savingTag,
            this.tagFeedback,
            rest.length ? { kind: 'error', messages: rest } : null,
          );
        },
      });
  }

  protected unlinkPlayer(tag: string): void {
    if (this.savingTag()) return;
    this.tagFeedback.set(null);
    this.savingTag.set(true);
    this.auth.unlinkPlayer(tag).subscribe({
      next: () =>
        this.finish(this.savingTag, this.tagFeedback, {
          kind: 'success',
          messages: [{ key: 'SUCCESS.PLAYER_UNLINKED', params: { tag } }],
        }),
      error: (error: unknown) =>
        this.finish(this.savingTag, this.tagFeedback, {
          kind: 'error',
          messages: this.allMessages(error),
        }),
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
    repeatPassword: {
      required: 'ERROR.REPEAT_PASSWORD_SHOULD_NOT_BE_EMPTY',
      mismatch: 'ERROR.PASSWORDS_DO_NOT_MATCH',
    },
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
        this.finish(this.savingPassword, this.passwordFeedback, {
          kind: 'success',
          messages: [{ key: 'SUCCESS.PASSWORD_UPDATED' }],
        });
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        const rest = [...applyServerErrors(this.passwordForm, fields), ...general];
        this.finish(
          this.savingPassword,
          this.passwordFeedback,
          rest.length ? { kind: 'error', messages: rest } : null,
        );
      },
    });
  }

  private finish(
    busy: { set(v: boolean): void },
    feedback: { set(v: Feedback): void },
    value: Feedback,
  ): void {
    feedback.set(value);
    busy.set(false);
  }

  private allMessages(error: unknown): BackendMessage[] {
    const { fields, general } = backendErrors(error);
    return [...general, ...fields];
  }
}
