import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { BackendMessage } from '../../core/backend/backend-api.types';

/**
 * Client-side rules, identical to the backend ones (`backend/src/modules/auth/auth.schemas.ts`),
 * so most mistakes are caught before sending. The backend stays the source of truth.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
export const PLAYER_TAG_PATTERN = /^#?[0-9A-Za-z]{3,15}$/;
const MAX_PASSWORD_BYTES = 72;

/** At least 8 characters with a letter and a digit, at most 72 bytes (bcrypt limit). */
export const strongPassword: ValidatorFn = (control) => {
  const value = String(control.value ?? '');
  if (!value) return null;
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) return { tooLong: true };
  return value.length >= 8 && /\p{L}/u.test(value) && /\d/.test(value) ? null : { weak: true };
};

/** Group validator: `repeatPassword` must equal `password` (error set on `repeatPassword`). */
export const passwordsMatch: ValidatorFn = (group) => {
  const repeat = group.get('repeatPassword');
  if (!repeat) return null;
  const mismatch = !!repeat.value && repeat.value !== group.get('password')?.value;
  const { mismatch: _old, ...others } = repeat.errors ?? {};
  const next: ValidationErrors | null = mismatch ? { ...others, mismatch: true } : Object.keys(others).length ? others : null;
  if (JSON.stringify(next) !== JSON.stringify(repeat.errors)) repeat.setErrors(next);
  return null;
};

/**
 * Translation key of the first error of a control. `keys` maps validator names to keys;
 * errors returned by the backend are stored as `{ server: '<ERROR.KEY>' }`.
 */
export function errorKey(control: AbstractControl | null, keys: Record<string, string>): string | null {
  const errors = control?.errors;
  if (!errors) return null;
  if (typeof errors['server'] === 'string') return errors['server'];
  const name = Object.keys(errors).find((e) => keys[e]);
  return name ? keys[name]! : null;
}

/** Shows backend field messages under the matching inputs; returns those without a matching input. */
export function applyServerErrors(form: FormGroup, messages: BackendMessage[]): BackendMessage[] {
  const unmatched: BackendMessage[] = [];
  for (const message of messages) {
    const control = message.field ? form.get(message.field) : null;
    if (control) {
      control.setErrors({ ...control.errors, server: message.key });
      control.markAsTouched();
    } else {
      unmatched.push(message);
    }
  }
  return unmatched;
}
