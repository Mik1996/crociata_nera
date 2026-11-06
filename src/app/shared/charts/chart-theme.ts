import { Chart, ChartDataset, ChartOptions } from 'chart.js';

/**
 * Chart series colours.
 * Gold/blue pair validated for the dark background (#18181b): lightness band, contrast and
 * colour-blindness separation (ΔE > 20). Red is NOT used as a series colour because
 * it cannot be told apart from gold by people with deuteranopia.
 */
export const CHART_COLORS = {
  gold: '#b8892c',
  goldTransparent: 'rgba(184, 137, 44, 0.2)',
  blue: '#4a90c8',
  blueTransparent: 'rgba(74, 144, 200, 0.2)',
  text: '#cfc7b8',
  grid: 'rgba(255, 255, 255, 0.08)',
  surface: '#18181b',
};

/** Sets Chart.js global defaults (call only once at startup). */
export function configureChartTheme(): void {
  Chart.defaults.color = CHART_COLORS.text;
  Chart.defaults.borderColor = CHART_COLORS.grid;
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.maintainAspectRatio = false;
  // Note: legend and tooltip are configured in `baseChartOptions`, because plugin defaults
  // only exist after registration by `provideCharts(withDefaultRegisterables())`.
}

/** Base options for line/bar charts. */
export function baseChartOptions<T extends 'line' | 'bar' = 'line'>(
  options: { min?: number; max?: number; suffix?: string; legend?: boolean } = {},
): ChartOptions<T> {
  const suffix = options.suffix ?? '';
  const base: ChartOptions<'line'> = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      // Legend only with 2+ series: with a single series the chart title is enough.
      legend: { display: options.legend ?? true, position: 'bottom', labels: { usePointStyle: true } },
      tooltip: {
        backgroundColor: '#141416',
        borderColor: '#5a4a2a',
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
        ticks: {
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
        ticks: { callback: (v) => `${v}${suffix}` },
      },
    },
  };
  // The options used are common to line and bar charts.
  return base as unknown as ChartOptions<T>;
}

/** Line series: 2px stroke, 8px markers with a ring of the background colour. */
export function lineSeries(
  label: string,
  data: number[],
  color: string,
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
    pointBorderColor: CHART_COLORS.surface,
    pointBorderWidth: 2,
    tension: 0.25,
  };
}

/** Bar series: 4px rounded ends, 2px gap between adjacent bars. */
export function barSeries(label: string, data: number[], color: string): ChartDataset<'bar', number[]> {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: CHART_COLORS.surface,
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
