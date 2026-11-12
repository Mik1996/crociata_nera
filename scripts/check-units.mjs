#!/usr/bin/env node
// Fails when a stylesheet hard-codes a pixel size.
// Sizes are in rem, spacing and corner radii come from the scales in `src/styles/_variables.scss`
// (`$space-*`, `$radius-*`). Pixels are allowed only for hairlines: values up to 2px (1px dividers,
// small shadow offsets) and border/outline widths and offsets.
//
// Checked: `src/**/*.scss`. A line that really needs pixels (e.g. a threshold the browser defines in
// px) can opt out with a `units-lint: allow` comment explaining why, on the line itself or on its own
// line just above the declaration.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const PX = /(?<![\w.-])-?(\d*\.?\d+)px\b/g;
// Properties whose pixel widths are hairlines by nature.
const BORDER =
  /^(border(-(top|right|bottom|left|inline|block)(-(start|end))?)?(-width)?|outline(-width|-offset)?|-webkit-text-stroke(-width)?)$/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (name.endsWith('.scss')) yield path;
  }
}

const problems = [];
for (const path of files(SRC)) {
  let prop = null; // property of the current, possibly multi-line, declaration
  let inBlockComment = false;
  let allowed = false; // a `units-lint: allow` comment covers the next declaration
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (inBlockComment) {
        if (line.includes('*/')) inBlockComment = false;
        return;
      }
      if (/^\s*\/\*/.test(line) && !line.includes('*/')) {
        inBlockComment = true;
        return;
      }
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      const decl = code.match(/^\s*(--[\w-]+|[a-z-]+)\s*:(?!:)/);
      if (decl) prop = decl[1];
      else if (/[{}]/.test(code)) prop = null;
      if (/^\s*\/\/.*units-lint: allow/.test(line)) {
        allowed = true;
        return;
      }
      if (!allowed && !line.includes('units-lint: allow') && !(prop && BORDER.test(prop))) {
        const found = [...code.matchAll(PX)].filter((m) => parseFloat(m[1]) > 2).map((m) => m[0]);
        if (found.length)
          problems.push(`${relative(ROOT, path)}:${i + 1}: ${[...new Set(found)].join(', ')}`);
      }
      if (code.includes(';')) {
        prop = null;
        allowed = false;
      }
    });
}

if (problems.length) {
  console.error(
    `Pixel sizes in stylesheets (${problems.length}), use rem or the $space-*/$radius-* scales:`,
  );
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('lint:units OK — no hard-coded pixel sizes.');
