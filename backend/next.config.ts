import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

/** API-only Next.js app: Route Handlers under `src/app/api`, no pages. */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Angular app in the parent folder has its own lockfile: pin the workspace root here.
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
};

export default nextConfig;
