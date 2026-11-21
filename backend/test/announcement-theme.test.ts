import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IRON_THEME, PALETTE_TOKENS } from '@/modules/announcements/image/announcement-theme';

/** `--cn-*` tokens of the frontend palette, with their literal colour (lower case). */
function paletteTokens(): Map<string, string[]> {
  const scss = readFileSync(path.join(process.cwd(), '..', 'src', 'styles', '_color-palette.scss'), 'utf8');
  const tokens = new Map<string, string[]>();
  for (const [, name, value] of scss.matchAll(/(--cn-[\w-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) {
    tokens.set(name!, [...(tokens.get(name!) ?? []), value!.toLowerCase()]);
  }
  return tokens;
}

describe('colours of the announcement pictures', () => {
  it('are the ones of the PDF tokens of the palette', () => {
    const tokens = paletteTokens();
    for (const [colour, token] of Object.entries(PALETTE_TOKENS)) {
      const values = tokens.get(token!);
      expect(values, `${token} in _color-palette.scss`).toBeDefined();
      // One value only: the PDFs have the same look in every theme.
      expect(values, `${colour} (${token})`).toEqual([IRON_THEME[colour as keyof typeof IRON_THEME].toLowerCase()]);
    }
  });
});
