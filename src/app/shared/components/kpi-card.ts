import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Card showing a numeric indicator. */
@Component({
  selector: 'app-kpi-card',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cn-card kpi', role: 'group', '[attr.aria-label]': 'label()' },
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.scss',
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
  /** Material icon name. */
  readonly icon = input<string>();
  /** Picture shown in place of the icon (same size). */
  readonly image = input<string | null>();
  /** Zoom of the picture, for game art with wide transparent margins (1 = as is). */
  readonly imageZoom = input(1);
  /** Shows the picture three times, arranged in a triangle (e.g. three stars). */
  readonly imageTriangle = input(false);
}
