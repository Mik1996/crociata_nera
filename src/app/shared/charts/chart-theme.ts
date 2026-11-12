import { Chart, ChartDataset, ChartOptions } from 'chart.js';
import { ThemeName } from '../../core/theme/themes';
import { cssColor, cssColorAlpha } from '../styles/css-color';

/**
 * Theme-dependent chart colours, read from the palette (`--cn-chart-*` tokens in
 * `src/styles/_color-palette.scss`): series, axis text, grid, tooltip and the surface used for mark
 * rings. The gold/blue series pair is validated on the chart surface: lightness band, contrast
 * >= 3:1 and colour-blindness separation (ΔE > 20). Red is NOT used as a series colour because it
 * cannot be told apart from gold by people with deuteranopia. Axis text meets 4.5:1 on the surface.
 */
export interface ChartChrome {
  series1: string;
  /** `series1` at 20% opacity (area fills). */
  series1Fill: string;
  series2: string;
  text: string;
  grid: string;
  surface: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
}

/**
 * Chart colours of the theme currently applied to the document. The `theme` argument is not read:
 * it makes callers recompute (e.g. in a `computed`) when the theme changes.
 */
export function chartChrome(_theme: ThemeName): ChartChrome {
  return {
    series1: canvasColor(cssColor('--cn-chart-series-1')),
    series1Fill: canvasColor(cssColorAlpha('--cn-chart-series-1', 0.2)),
    series2: canvasColor(cssColor('--cn-chart-series-2')),
    text: canvasColor(cssColor('--cn-chart-text')),
    grid: canvasColor(cssColor('--cn-chart-grid')),
    surface: canvasColor(cssColor('--cn-chart-surface')),
    tooltipBackground: canvasColor(cssColor('--cn-chart-tooltip-bg')),
    tooltipBorder: canvasColor(cssColor('--cn-chart-tooltip-border')),
    tooltipText: canvasColor(cssColor('--cn-chart-tooltip-text')),
  };
}

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Normalises any CSS colour (e.g. `color-mix(...)`) to the hex/rgba form the canvas serialises, which
 * Chart.js can parse for its hover shades. Returns the value unchanged without a canvas (unit tests).
 */
function canvasColor(value: string): string {
  if (!value) return value;
  if (probe === undefined) {
    try {
      probe = document.createElement('canvas').getContext('2d');
    } catch {
      probe = null;
    }
  }
  if (!probe) return value;
  probe.fillStyle = 'transparent';
  probe.fillStyle = value;
  return String(probe.fillStyle);
}

/** Sets Chart.js global defaults (call only once at startup). Colours are set per chart. */
export function configureChartTheme(): void {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.maintainAspectRatio = false;
  // Note: legend and tooltip are configured in `baseChartOptions`, because plugin defaults
  // only exist after registration by `provideCharts(withDefaultRegisterables())`.
}

/** Base options for line/bar charts, with the colours of the given theme chrome. */
export function baseChartOptions<T extends 'line' | 'bar' = 'line'>(
  chrome: ChartChrome,
  options: { min?: number; max?: number; suffix?: string; legend?: boolean } = {},
): ChartOptions<T> {
  const suffix = options.suffix ?? '';
  const base: ChartOptions<'line'> = {
    responsive: true,
    // Colours change instantly: the theme switch already cross-fades the whole page.
    animations: { colors: false },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      // Legend only with 2+ series: with a single series the chart title is enough.
      legend: {
        display: options.legend ?? true,
        position: 'bottom',
        labels: { usePointStyle: true, color: chrome.text },
      },
      tooltip: {
        backgroundColor: chrome.tooltipBackground,
        borderColor: chrome.tooltipBorder,
        titleColor: chrome.tooltipText,
        bodyColor: chrome.tooltipText,
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}${suffix}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: chrome.grid },
        ticks: {
          color: chrome.text,
          maxRotation: 0,
          autoSkipPadding: 12,
          // "date · opponent" labels: only the date on the axis, the tooltip shows everything.
          callback(value) {
            return String(this.getLabelForValue(Number(value))).split(' · ')[0];
          },
        },
      },
      y: {
        min: options.min,
        max: options.max,
        grid: { color: chrome.grid },
        border: { color: chrome.grid },
        ticks: { color: chrome.text, callback: (v) => `${v}${suffix}` },
      },
    },
  };
  // The options used are common to line and bar charts.
  return base as unknown as ChartOptions<T>;
}

/** Line series: 2px stroke, 8px markers with a ring of the surface colour. */
export function lineSeries(
  label: string,
  data: number[],
  color: string,
  chrome: ChartChrome,
  fill?: string,
): ChartDataset<'line', number[]> {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fill ?? color,
    fill: !!fill,
    borderWidth: 2,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: color,
    pointBorderColor: chrome.surface,
    pointBorderWidth: 2,
    tension: 0.25,
  };
}

/** Bar series: 4px rounded ends, 2px gap between adjacent bars. */
export function barSeries(
  label: string,
  data: number[],
  color: string,
  chrome: ChartChrome,
): ChartDataset<'bar', number[]> {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: chrome.surface,
    borderWidth: { left: 1, right: 1 },
    borderRadius: { topLeft: 4, topRight: 4 },
    borderSkipped: 'bottom',
    maxBarThickness: 28,
  };
}

/** Short date label for axes, in the given locale (e.g. "05/11" or "11/05"). */
export function shortDateLabel(iso: string, locale = 'it-IT'): string {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}
