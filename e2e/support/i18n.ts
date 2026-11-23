import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** English texts of the site (the tests run the browser with `locale: 'en-US'`). */
const EN = JSON.parse(
  readFileSync(join(__dirname, '../../public/i18n/en-US.json'), 'utf8'),
) as Record<string, unknown>;

/**
 * The English text of a translation key, with ngx-translate's `{{param}}` placeholders filled.
 * Tests locate UI text by key: a reworded label does not break them, a missing key does.
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], EN);
  if (typeof value !== 'string') throw new Error(`missing translation key "${key}" in en-US.json`);
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) =>
    String(params[name] ?? `{{${name}}}`),
  );
}
