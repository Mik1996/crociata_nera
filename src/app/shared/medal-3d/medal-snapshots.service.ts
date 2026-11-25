import { DOCUMENT, inject, Injectable } from '@angular/core';
import { MedalFinish, resolveFinish } from './medal-finish';
import { STILL_EXTENT } from './medal-still';

/**
 * Still 3D medals drawn in the browser at any size, as image URLs: for pictures larger than the
 * pre-rendered stills (`medal-still.ts`), such as the share cards. Three.js is downloaded with the
 * first request; every image is drawn once and cached for the session.
 * Resolves to `null` without WebGL (the caller keeps the flat medal).
 */
@Injectable({ providedIn: 'root' })
export class MedalSnapshots {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly cache = new Map<string, Promise<string | null>>();
  /** One drawing at a time: the renderer is shared. */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * A medal earned, `pixels` wide whatever the screen (pictures made for other devices, such as the
   * share cards).
   */
  still(svgUrl: string, finish: MedalFinish, pixels: number): Promise<string | null> {
    return this.snapshotPixels(svgUrl, finish, false, Math.round(pixels));
  }

  private snapshotPixels(
    svgUrl: string,
    finish: MedalFinish,
    locked: boolean,
    pixels: number,
  ): Promise<string | null> {
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
        extent: STILL_EXTENT,
      });
      return URL.createObjectURL(blob);
    });
    // A failed medal does not block the next ones.
    this.queue = job.catch(() => undefined);
    return job.catch(() => null);
  }
}
