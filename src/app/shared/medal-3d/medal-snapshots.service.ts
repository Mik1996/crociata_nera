import { DOCUMENT, inject, Injectable } from '@angular/core';
import { MedalFinish, resolveFinish } from './medal-finish';

/** Framing shared by all the still medals: room for rays and laurel, coins of equal size. */
const SNAPSHOT_EXTENT = 1.32;

/**
 * Still 3D medals as image URLs, for lists of medals that do not move. Three.js is downloaded
 * with the first request; every image is drawn once and cached for the session.
 * Resolves to `null` without WebGL (the caller keeps the flat medal).
 */
@Injectable({ providedIn: 'root' })
export class MedalSnapshots {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly cache = new Map<string, Promise<string | null>>();
  /** One drawing at a time: the renderer is shared. */
  private queue: Promise<unknown> = Promise.resolve();

  /** `size` in CSS pixels: the image is drawn for the screen's pixel density. */
  snapshot(svgUrl: string, finish: MedalFinish, locked: boolean, size: number): Promise<string | null> {
    const pixels = Math.round(size * Math.min(this.window?.devicePixelRatio || 1, 2));
    const key = JSON.stringify([svgUrl, finish, locked, pixels]);
    let url = this.cache.get(key);
    if (!url) {
      url = this.supported() ? this.draw(svgUrl, finish, locked, pixels) : Promise.resolve(null);
      this.cache.set(key, url);
    }
    return url;
  }

  private supported(): boolean {
    return typeof this.window?.WebGLRenderingContext !== 'undefined';
  }

  private draw(svgUrl: string, finish: MedalFinish, locked: boolean, size: number): Promise<string | null> {
    const job = this.queue.then(async () => {
      const [{ renderMedalSnapshot }, svg] = await Promise.all([
        import('./medal-snapshot'),
        fetch(svgUrl).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        }),
      ]);
      const blob = await renderMedalSnapshot({
        svg,
        finish: resolveFinish(finish, locked),
        locked,
        size,
        extent: SNAPSHOT_EXTENT,
      });
      return URL.createObjectURL(blob);
    });
    // A failed medal does not block the next ones.
    this.queue = job.catch(() => undefined);
    return job.catch(() => null);
  }
}
