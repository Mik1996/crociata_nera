import { z } from 'zod';
import { operationErrors } from '@/openapi/document';
import { baseResult } from '@/openapi/models/common';
import { ApiOperation } from '@/openapi/operation';
import { API_OPERATIONS } from '@/openapi/operations';

/**
 * Contract between the routes and the OpenAPI document (`src/openapi`): every response the tests
 * receive through `call()` must be documented, with the same status, result shape (strictly: no
 * undocumented fields) and message keys. When a route changes, its documentation must change too.
 */

/** `/wars/{warKey}` → the module of `src/app/api/v1/wars/[warKey]/route.ts`. */
export function routeModule(path: string): string {
  return `@/app/api/v1${path.replace(/\{(\w+)\}/g, '[$1]')}/route`;
}

let operations: Promise<Map<unknown, ApiOperation>> | undefined;

/** Route handler → its documented operation. */
export function operationsByHandler(): Promise<Map<unknown, ApiOperation>> {
  operations ??= Promise.all(
    API_OPERATIONS.map(async (op) => {
      const module = (await import(/* @vite-ignore */ routeModule(op.path))) as Record<string, unknown>;
      return [module[op.method], op] as const;
    }),
  ).then((entries) => new Map(entries));
  return operations;
}

/** Throws when the response of `handler` is not the one documented. Undocumented handlers are skipped. */
export async function assertContract(handler: unknown, status: number, body: unknown): Promise<void> {
  const op = (await operationsByHandler()).get(handler);
  if (!op) return;
  const problems = contractProblems(op, status, body);
  if (problems.length) {
    throw new Error(
      `Response ${status} of ${op.method} /api/v1${op.path} differs from the OpenAPI document (src/openapi):\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
  }
}

export function contractProblems(op: ApiOperation, status: number, body: unknown): string[] {
  const success = op.responses[status];
  if (success?.binary || success?.raw) return [];

  const keys = success ? (success.messages ?? []) : operationErrors(op).get(status);
  if (!keys) return [`status ${status} is not documented (add it to \`responses\` or \`errors\`)`];

  const parsed = baseResult(success ? success.result : null).safeParse(body);
  const problems = parsed.success ? [] : parsed.error.issues.map(describeIssue);
  const messages = (body as { messages?: { key?: unknown }[] } | null)?.messages ?? [];
  for (const { key } of messages) {
    if (!keys.includes(key as never)) problems.push(`message key ${String(key)} is not documented for status ${status}`);
  }
  return problems;
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.map(String).join('.') || '(body)';
  const keys = issue.code === 'unrecognized_keys' ? `: ${issue.keys.join(', ')}` : '';
  return `${path}: ${issue.message}${keys}`;
}
