import { Directive } from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';

/**
 * The parts of Chart.js the site uses: line and bar charts on category/linear axes, with legend,
 * tooltip and area fills. Registering only these (instead of every registerable) keeps the rest of
 * Chart.js out of the bundle.
 */
export const CHART_REGISTERABLES = [
  LineController,
  BarController,
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
];

/**
 * A Chart.js chart on a `<canvas>`: `<canvas crnChart type="line" [data]="…" [options]="…">`.
 *
 * Wraps ng2-charts' `BaseChartDirective` and gives it its configuration, so Chart.js (with its
 * registration and global defaults) is downloaded only with the pages that draw charts, never with
 * the start of the app. The directive registers the parts above when it is created, before its
 * chart is.
 */
@Directive({
  selector: 'canvas[crnChart]',
  hostDirectives: [
    {
      directive: BaseChartDirective,
      inputs: ['type', 'data', 'options', 'legend', 'labels', 'datasets', 'plugins'],
    },
  ],
  providers: [
    provideCharts({
      registerables: CHART_REGISTERABLES,
      // Colours are set per chart (`baseChartOptions`), with the theme in use.
      defaults: {
        font: { family: "'Inter', system-ui, sans-serif" },
        maintainAspectRatio: false,
      },
    }),
  ],
})
export class ChartCanvas {}
