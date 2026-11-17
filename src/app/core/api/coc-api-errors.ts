import { HttpErrorResponse } from '@angular/common/http';
import { InterpolationParameters } from '@ngx-translate/core';
import { Observable, throwError } from 'rxjs';
import { TranslatableError } from '../i18n/translatable-error';
import { backendErrors } from '../backend/backend-errors';

/**
 * Error of a data request, with a translatable message: the UI uses `i18nKey` (a key of the
 * backend, `ERROR.*`, or of the site); `message` is in English (logs and diagnostics).
 */
export class CocApiHttpError extends Error implements TranslatableError {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
    readonly i18nKey = 'errors.server',
    readonly i18nParams?: InterpolationParameters,
  ) {
    super(message);
    this.name = 'CocApiHttpError';
  }
}

/**
 * Converts an HTTP error of the backend into a {@link CocApiHttpError} with a translatable message:
 * the first message of the backend (`ERROR.*`, e.g. `ERROR.COC_API_UNAVAILABLE`), or "offline" /
 * "backend unreachable" when it gave none.
 */
export function toBackendError(err: HttpErrorResponse): Observable<never> {
  const [first] = backendErrors(err).general;
  return throwError(
    () =>
      new CocApiHttpError(
        `Backend error ${err.status}: ${first?.key ?? 'no answer'}`,
        err.status,
        undefined,
        first?.key ?? 'errors.server',
        first?.params ?? { status: err.status },
      ),
  );
}
