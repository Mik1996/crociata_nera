import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Files of the site's `public/` folder the backend draws with (fonts, medals, clan crests). In the
 * Docker image they are copied to `/app/site-assets` (`deploy/backend.Dockerfile`; not `public/`,
 * which Next.js would serve); in development and tests they are read from the repository (`../public`).
 * The reads are left out of Next.js's file tracing (`turbopackIgnore`): it would otherwise copy the
 * whole project into the build.
 */
const DOCKER_ROOT = path.join(process.cwd(), 'site-assets');
const REPOSITORY_ROOT = path.join(process.cwd(), '..', 'public');

let root: string | null = null;

function publicRoot(): string {
  root ??= existsSync(/*turbopackIgnore: true*/ path.join(DOCKER_ROOT, 'commendations')) ? DOCKER_ROOT : REPOSITORY_ROOT;
  return root;
}

const cache = new Map<string, Promise<Buffer>>();

/** A file of `public/` (`commendations/donor-gold.svg`), read once and kept in memory. */
export function readSiteAsset(relativePath: string): Promise<Buffer> {
  let file = cache.get(relativePath);
  if (!file) {
    file = readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ publicRoot(), relativePath));
    // A missing file is not cached: it may be deployed later.
    file.catch(() => cache.delete(relativePath));
    cache.set(relativePath, file);
  }
  return file;
}
