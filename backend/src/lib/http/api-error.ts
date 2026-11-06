import { MessageDescriptor } from './base-result';
import { MessageKey } from './message-key';

/** Expected error: becomes a `BaseResult` with the given status and messages. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly messages: MessageDescriptor[],
    /** Extra response headers (e.g. `Retry-After`). */
    readonly headers: Record<string, string> = {},
  ) {
    super(messages.map((m) => m.key).join(', ') || `HTTP ${statusCode}`);
    this.name = 'ApiError';
  }
}

/** Throws an {@link ApiError}; accepts a single key for the common case. */
export function throwException(
  statusCode: number,
  messages: MessageDescriptor[] | MessageKey,
  headers?: Record<string, string>,
): never {
  throw new ApiError(statusCode, typeof messages === 'string' ? [{ key: messages }] : messages, headers);
}
