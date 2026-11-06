import { MessageKey } from './message-key';

/** A message for the client: a translation key, optional interpolation params, optional field. */
export interface MessageDescriptor {
  key: MessageKey | string;
  params?: Record<string, string | number>;
  /** Request field the message refers to (validation errors). */
  field?: string;
}

export interface Status {
  code: number;
  /** e.g. `HTTP_STATUS.BAD_REQUEST`. */
  name: string;
}

/** Uniform response envelope (same shape as continental-be). */
export interface BaseResult<T> {
  result: T | null;
  messages: MessageDescriptor[];
  status: Status;
}

const STATUS_NAMES: Record<number, string> = {
  200: 'OK',
  201: 'CREATED',
  204: 'NO_CONTENT',
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

export function statusOf(code: number): Status {
  return { code, name: `HTTP_STATUS.${STATUS_NAMES[code] ?? 'UNKNOWN'}` };
}

export function buildResult<T>(code: number, result: T | null, messages: MessageDescriptor[] = []): BaseResult<T> {
  return { result, messages, status: statusOf(code) };
}
