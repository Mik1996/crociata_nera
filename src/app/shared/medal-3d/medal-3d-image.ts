import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { MedalFinish } from './medal-finish';
import { MedalSnapshots } from './medal-snapshots.service';

/**
 * A 3D medal at rest (no rotation, no interaction), as a still image: cheap enough for a whole
 * grid of medals. Shows the flat SVG until the 3D image is ready, or for good without WebGL.
 * Decorative: the accessible name is given by the parent.
 */
@Component({
  selector: 'app-medal-3d-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medal-3d-image.html',
  styleUrl: './medal-3d-image.scss',
})
export class Medal3dImage {
  /** Flat medal SVG: source of the 3D medal and placeholder. */
  readonly svgUrl = input.required<string>();
  readonly finish = input<MedalFinish>('gold');
  readonly locked = input(false);
  /** Displayed width in CSS pixels (the image is drawn for it). */
  readonly size = input(104);

  private readonly snapshots = inject(MedalSnapshots);

  private readonly snapshot = resource({
    params: () => ({ url: this.svgUrl(), finish: this.finish(), locked: this.locked(), size: this.size() }),
    loader: ({ params }) => this.snapshots.snapshot(params.url, params.finish, params.locked, params.size),
  });

  /** The 3D image once drawn. */
  protected readonly image = computed(() => (this.snapshot.hasValue() ? this.snapshot.value() : null));
}
