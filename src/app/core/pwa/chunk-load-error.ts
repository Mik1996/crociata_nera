import { NavigationError } from '@angular/router';

/** Messages of a failed dynamic import in Chromium, Firefox and Safari. */
const CHUNK_LOAD_FAILURE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/** sessionStorage key: the last page reloaded because its code could not be loaded. */
export const CHUNK_RELOAD_KEY = 'crociata-nera.chunk-reload';
/** A second failure on the same page within this time is not reloaded again (no reload loop). */
const RELOAD_GUARD_MS = 10_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_LOAD_FAILURE.test(message);
}

/**
 * Navigation error handler: the code of a page could not be downloaded, typically because a
 * deploy replaced the files of the version this tab is running. Loading the page again brings the
 * new version. Offline there is nothing to gain, and a page that keeps failing is not reloaded twice.
 */
export function reloadOnChunkLoadError(event: NavigationError, win: Window = window): void {
  reloadForChunkLoadError(event.error, event.url, win);
}

/**
 * Loads `url` again from the server when `error` is a failed download of code (see
 * {@link reloadOnChunkLoadError}); also for dynamic imports made outside the router. Returns whether
 * the page is being reloaded: `false` for other errors, offline, or a page that already failed.
 */
export function reloadForChunkLoadError(
  error: unknown,
  url: string,
  win: Window = window,
): boolean {
  if (!isChunkLoadError(error) || !win.navigator.onLine) return false;
  const now = Date.now();
  try {
    const last = JSON.parse(win.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 'null') as {
      url: string;
      at: number;
    } | null;
    if (last?.url === url && now - last.at < RELOAD_GUARD_MS) return false;
    win.sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify({ url, at: now }));
  } catch {
    // sessionStorage unavailable: reload anyway, the browser keeps the user on the page.
  }
  win.location.assign(url);
  return true;
}
