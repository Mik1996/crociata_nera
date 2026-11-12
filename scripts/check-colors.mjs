#!/usr/bin/env node
// Fails when a colour literal is written outside the colour palette.
// The single source of truth for colours is `src/styles/_color-palette.scss`: everything else must
// use its `--cn-*` custom properties (and `palette.alpha()` for transparent variants).
//
// Checked: hex colours, rgb()/rgba()/hsl()/hsla() and CSS named colours in `src/**/*.{scss,css,html,ts}`
// (spec files excluded). A line that really needs a literal (e.g. a value read before the styles
// load) can opt out with a `color-lint: allow` comment explaining why.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const PALETTE = join(SRC, 'styles', '_color-palette.scss');
const EXTENSIONS = ['.scss', '.css', '.html', '.ts'];

const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FUNC = /\b(?:rgba?|hsla?)\(/g;
// Named colours as CSS values (after `:` in styles or inside a colour-ish attribute/property).
const NAMED =
  /(?:^|[\s:(,'"])(white|black|red|green|blue|yellow|orange|purple|gray|grey|silver|gold|navy|maroon|teal|olive|lime|aqua|fuchsia|pink|brown|crimson)(?=[\s;,)'"!]|$)/gi;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (EXTENSIONS.some((ext) => name.endsWith(ext)) && !name.endsWith('.spec.ts')) yield path;
  }
}

/** Whether a named-colour match on this line is really a CSS colour value. */
function isStyleValue(path, line) {
  if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return false; // comment lines
  if (path.endsWith('.scss') || path.endsWith('.css')) {
    const code = line.replace(/\/\/.*$/, '');
    return /:\s*[^;{]*$|:\s*[^;{]*;/.test(code) && !/^\s*[@&.#\w-][^:]*\{\s*$/.test(code);
  }
  return /(?:fill|stroke|color|background)\s*[:=]/i.test(line);
}

const problems = [];
for (const path of files(SRC)) {
  if (path === PALETTE) continue;
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('color-lint: allow')) return;
    // In templates only style-like attributes can hold colours (`placeholder="#ABC123"` is a tag).
    if (path.endsWith('.html') && !/(?:fill|stroke|color|style|background)\s*=/i.test(line)) return;
    const found = [...line.matchAll(HEX), ...line.matchAll(FUNC)].map((m) => m[0]);
    if (isStyleValue(path, line)) {
      for (const m of line.matchAll(NAMED)) found.push(m[1]);
    }
    if (found.length) problems.push(`${relative(ROOT, path)}:${i + 1}: ${[...new Set(found)].join(', ')}`);
  });
}

if (problems.length) {
  console.error(`Colour literals outside src/styles/_color-palette.scss (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('lint:colors OK — every colour comes from the palette.');
