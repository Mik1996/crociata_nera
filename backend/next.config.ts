import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

/** API-only Next.js app: Route Handlers under `src/app/api`, no pages. */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Docker image (deploy/backend.Dockerfile): self-contained server in .next/standalone.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // The Angular app in the parent folder has its own lockfile: pin the workspace root here.
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
};

export default nextConfig;
