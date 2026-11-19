import { vi } from 'vitest';

/** A call received by the fake Telegram: the method and its parameters (files as `Blob`). */
export interface TelegramCall {
  method: string;
  params: Record<string, unknown>;
}

/** What the fake answers: a result, or an error as Telegram writes it. */
export type TelegramReply = { result: unknown } | { error: number; description: string; retryAfter?: number };

type Handler = (params: Record<string, unknown>) => TelegramReply | undefined;

export const TELEGRAM_TEST_BASE_URL = 'https://telegram.test';

/**
 * Fake Telegram Bot API. Every method answers `ok` by default (`sendPhoto` with a new message id,
 * `getMe` with the bot); `handlers` change a method's answer (returning `undefined` keeps the
 * default). `calls` lists every call received, in order.
 */
export function mockTelegramApi(handlers: Record<string, Handler> = {}) {
  const calls: TelegramCall[] = [];
  let nextMessageId = 100;
  const defaults: Record<string, Handler> = {
    getMe: () => ({ result: { id: 4242, is_bot: true, username: 'CrociataNeraTestBot' } }),
    sendPhoto: () => ({ result: { message_id: nextMessageId++ } }),
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== TELEGRAM_TEST_BASE_URL) throw new Error(`unexpected request to ${url.origin}`);
    const method = url.pathname.split('/').pop()!;
    const params: Record<string, unknown> = {};
    if (init?.body instanceof FormData) {
      for (const [name, value] of init.body.entries()) params[name] = value;
    } else if (typeof init?.body === 'string') {
      Object.assign(params, JSON.parse(init.body));
    }
    calls.push({ method, params });
    const reply = handlers[method]?.(params) ?? defaults[method]?.(params) ?? { result: true };
    const body =
      'result' in reply
        ? { ok: true, result: reply.result }
        : {
            ok: false,
            error_code: reply.error,
            description: reply.description,
            ...(reply.retryAfter ? { parameters: { retry_after: reply.retryAfter } } : {}),
          };
    return new Response(JSON.stringify(body), { status: 'result' in reply ? 200 : reply.error });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    /** The calls of one method. */
    of: (method: string) => calls.filter((c) => c.method === method),
    reset: () => calls.splice(0),
  };
}
