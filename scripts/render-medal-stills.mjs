// Pre-renders the still 3D medals of the commendations (public/commendations/3d/<emblem>.webp and
// <emblem>-locked.webp) with the site's own Three.js code, in headless Chromium (software WebGL).
// The lists of medals show these pictures instead of drawing them in the browser at every visit.
//
//   npm run medals          render them again (after changing the medals, their finishes or lights)
//   npm run medals:check    fail when they are out of date (CI): compares a fingerprint of what the
//                           pictures are made of (3D code, SVGs, colours) with the one saved with them
//
// esbuild and sass come with the Angular build tools; Chromium with @playwright/test (only to render).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import * as sass from 'sass';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgDir = join(root, 'public/commendations');
const outDir = join(svgDir, '3d');
const manifestPath = join(root, 'scripts/medal-stills/manifest.json');
const check = process.argv.includes('--check');

/** The palette compiled for one theme: the 3D tokens are the same in every theme. */
function paletteCss() {
  return sass.compileString(
    `@use 'color-palette' as palette;\n:root { @include palette.theme-tokens-iron; @include palette.identity-tokens; }`,
    { loadPaths: [join(root, 'src/styles')] },
  ).css;
}

/** The site's code that draws the stills (Three.js included), as one script. */
async function bundle() {
  const result = await esbuild.build({
    entryPoints: [join(root, 'scripts/medal-stills/entry.ts')],
    // Paths in the bundle relative to the project: the same fingerprint on every machine.
    absWorkingDir: root,
    bundle: true,
    format: 'esm',
    write: false,
    target: 'es2022',
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

/** What the pictures are made of: that code, the SVGs and the colours of the 3D medal. */
function fingerprint(code, css) {
  const hash = createHash('sha256').update(code);
  for (const file of readdirSync(svgDir).filter((f) => f.endsWith('.svg')).sort()) {
    hash.update(file).update(readFileSync(join(svgDir, file)));
  }
  // Colours of the 3D medal only: the rest of the palette can change freely.
  for (const line of css.split('\n').filter((l) => /--cn-(light|shadow|3d-|medal-)/.test(l)).sort()) {
    hash.update(line.trim());
  }
  return hash.digest('hex');
}

const css = paletteCss();
const code = await bundle();
const inputs = fingerprint(code, css);

if (check) {
  const saved = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const missing = (saved?.files ?? []).filter((f) => !existsSync(join(outDir, f)));
  if (!saved || saved.inputs !== inputs || missing.length) {
    console.error(
      'medals:check FAILED — the pre-rendered 3D medals are out of date: run `npm run medals` and commit public/commendations/3d/.',
    );
    process.exit(1);
  }
  console.log(`medals:check OK — ${saved.files.length} still medals up to date.`);
  process.exit(0);
}

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (error) => console.error(error));
await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body></body></html>`);
await page.addScriptTag({ content: code, type: 'module' });
await page.waitForFunction(() => 'medalStills' in window);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const medals = await page.evaluate(() => window.medalStills.medals());
const files = [];
let bytes = 0;
for (const medal of medals) {
  const svg = readFileSync(join(svgDir, `${medal.emblem}.svg`), 'utf8');
  for (const locked of [false, true]) {
    const dataUrl = await page.evaluate(
      ([svg, medal, locked]) => window.medalStills.render(svg, medal, locked),
      [svg, medal, locked],
    );
    if (!dataUrl.startsWith('data:image/webp')) throw new Error(`${medal.emblem}: not a WebP picture`);
    const file = `${medal.emblem}${locked ? '-locked' : ''}.webp`;
    const data = Buffer.from(dataUrl.split(',')[1], 'base64');
    writeFileSync(join(outDir, file), data);
    files.push(file);
    bytes += data.length;
  }
}
await browser.close();
writeFileSync(manifestPath, JSON.stringify({ inputs, files }, null, 2) + '\n');
console.log(`${files.length} still medals written to public/commendations/3d/ (${Math.round(bytes / 1024)} KB).`);
