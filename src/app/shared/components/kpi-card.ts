import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-names';

/** Card showing a numeric indicator. */
@Component({
  selector: 'crn-kpi-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cn-card kpi', role: 'group', '[attr.aria-label]': 'label()' },
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.scss',
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
  /** Icon shown when there is no picture. */
  readonly icon = input<IconName>();
  /** Picture shown in place of the icon (same size). */
  readonly image = input<string | null>();
  /** Zoom of the picture, for game art with wide transparent margins (1 = as is). */
  readonly imageZoom = input(1);
  /** Shows the picture three times, arranged in a triangle (e.g. three stars). */
  readonly imageTriangle = input(false);
}
