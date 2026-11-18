/** Code files of the build: hashed names at the root of the site (`/main-….js`, `/chunk-….js`). */
const BUILD_SCRIPT = /^\/[\w.-]+\.js$/;
/** Files of the service worker itself, never cached as app code. */
const WORKER_SCRIPTS = new Set(['/ngsw-worker.js', '/safety-worker.js', '/worker-basic.min.js']);

/**
 * Hands the code already running to the service worker, so the site opens offline after the first
 * visit.
 *
 * Only `index.html`, `main` and the styles are downloaded when the service worker installs; the
 * other code files (`chunk-….js`, in the lazy `app-code` group of `ngsw-config.json`) are cached
 * the first time they are requested through it. Their hashed names cannot tell the chunks needed at
 * startup from those of single pages, so they all load on demand. On the first visit, though, the
 * startup chunks were downloaded before the worker took control of the page: once it does
 * (`controllerchange`), they are requested again — from the browser's HTTP cache, at almost no
 * cost — and so cached by the worker. Later visits go through the worker from the start.
 *
 * Returns a function that stops listening.
 */
export function cacheStartupScripts(win: Window = window): () => void {
  const container = win.navigator.serviceWorker;
  if (!container) return () => undefined;
  const onControllerChange = () => {
    container.removeEventListener('controllerchange', onControllerChange);
    for (const url of loadedScripts(win)) void win.fetch(url).catch(() => undefined);
  };
  container.addEventListener('controllerchange', onControllerChange);
  return () => container.removeEventListener('controllerchange', onControllerChange);
}

/** Same-origin code files the page has loaded so far (startup chunks, pages already opened). */
export function loadedScripts(win: Window): string[] {
  const urls = new Set<string>();
  const add = (href: string) => {
    let url: URL;
    try {
      url = new URL(href, win.location.href);
    } catch {
      return;
    }
    if (url.origin !== win.location.origin) return;
    if (BUILD_SCRIPT.test(url.pathname) && !WORKER_SCRIPTS.has(url.pathname))
      urls.add(url.pathname);
  };
  for (const script of Array.from(win.document.scripts)) if (script.src) add(script.src);
  for (const entry of win.performance?.getEntriesByType?.('resource') ?? []) add(entry.name);
  return [...urls];
}
