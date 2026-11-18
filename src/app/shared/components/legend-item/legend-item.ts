import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One entry of a `crn-legend`: a colour swatch and the projected text. */
@Component({
  selector: 'crn-legend-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'listitem', '[style.--legend-color]': 'color()' },
  templateUrl: './legend-item.html',
  styleUrl: './legend-item.scss',
})
export class LegendItem {
  /** Colour of the swatch: a `var(--cn-*)` token. */
  readonly color = input.required<string>();
  /** The swatch glows with its colour (like the glowing items it explains). */
  readonly glow = input(false, { transform: booleanAttribute });
}
