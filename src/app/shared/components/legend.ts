import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Legend of a chart, bar or colour code: a wrapping row of `crn-legend-item`s.
 *
 * ```html
 * <crn-legend>
 *   <crn-legend-item color="var(--cn-lineup-starter)" glow>Titolari 15/15</crn-legend-item>
 * </crn-legend>
 * ```
 */
@Component({
  selector: 'crn-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'list' },
  templateUrl: './legend.html',
  styleUrl: './legend.scss',
})
export class Legend {}
