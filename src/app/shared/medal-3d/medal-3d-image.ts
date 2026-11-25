import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { medalStillUrl } from './medal-still';

/**
 * A 3D medal at rest, as a picture pre-rendered at build time (`npm run medals`): cheap enough for
 * a whole grid of medals, with no Three.js nor drawing in the browser. Shows the flat SVG when the
 * picture cannot be loaded. Decorative: the accessible name is given by the parent.
 */
@Component({
  selector: 'crn-medal-3d-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medal-3d-image.html',
  styleUrl: './medal-3d-image.scss',
})
export class Medal3dImage {
  /** Flat medal SVG (`commendations/<emblem>.svg`): names the still and is its fallback. */
  readonly svgUrl = input.required<string>();
  /** Not earned yet: the dark matte still. */
  readonly locked = input(false);

  protected readonly still = computed(() => medalStillUrl(this.svgUrl(), this.locked()));
  /** The still could not be loaded (reset when the medal changes). */
  protected readonly failed = linkedSignal({ source: this.still, computation: () => false });
}
