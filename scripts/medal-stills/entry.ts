// Bundled by scripts/render-medal-stills.mjs and run in a headless browser: draws the still 3D
// medals with the site's own code (same renderer, finishes and framing as the app).
import { COMMENDATION_TYPES, emblemOf, medalsOf, styleOf } from '../../src/app/core/utils/commendations';
import { resolveFinish } from '../../src/app/shared/medal-3d/medal-finish';
import { renderMedalSnapshot } from '../../src/app/shared/medal-3d/medal-snapshot';
import { STILL_EXTENT, STILL_PIXELS } from '../../src/app/shared/medal-3d/medal-still';

/** A medal of the catalogue: its image name and its look. */
interface StillMedal {
  emblem: string;
  finish: ReturnType<typeof styleOf>;
}

declare global {
  interface Window {
    medalStills: {
      medals(): StillMedal[];
      render(svg: string, medal: StillMedal, locked: boolean): Promise<string>;
    };
  }
}

window.medalStills = {
  medals: () =>
    COMMENDATION_TYPES.flatMap((type) =>
      medalsOf(type).map((medal) => ({ emblem: emblemOf(medal), finish: styleOf(medal) })),
    ),

  /** The still as a WebP data URL. */
  async render(svg, medal, locked) {
    const png = await renderMedalSnapshot({
      svg,
      finish: resolveFinish(medal.finish, locked),
      locked,
      size: STILL_PIXELS,
      extent: STILL_EXTENT,
    });
    const image = await createImageBitmap(png);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.9);
  },
};
