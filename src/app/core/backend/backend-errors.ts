import { HttpErrorResponse } from '@angular/common/http';
import { BackendMessage, BaseResult } from './backend-api.types';

/** Translation key used when the backend cannot be reached or gives no usable answer. */
export const BACKEND_UNREACHABLE = 'auth.errors.backendUnreachable';

/**
 * Messages of a failed backend call, split into field messages (shown under the inputs)
 * and general ones. Keys are translation keys (`ERROR.*`).
 */
export function backendErrors(error: unknown): { fields: BackendMessage[]; general: BackendMessage[] } {
  const body = error instanceof HttpErrorResponse ? (error.error as Partial<BaseResult<unknown>> | null) : null;
  const messages = Array.isArray(body?.messages) ? body.messages.filter((m) => typeof m?.key === 'string') : [];
  if (!messages.length) return { fields: [], general: [{ key: BACKEND_UNREACHABLE }] };
  return {
    fields: messages.filter((m) => m.field),
    general: messages.filter((m) => !m.field),
  };
}
