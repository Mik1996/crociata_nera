import { Chart, ChartDataset, ChartOptions } from 'chart.js';
import { ThemeName } from '../../core/theme/themes';

/**
 * Chart series colours, shared by both themes.
 * The gold/blue pair is validated on the dark (#18181b) and light (#ffffff) chart surfaces:
 * lightness band, contrast >= 3:1 and colour-blindness separation (ΔE > 20). Red is NOT used as a
 * series colour because it cannot be told apart from gold by people with deuteranopia.
 */
export const CHART_COLORS = {
  gold: '#b8892c',
  goldTransparent: 'rgba(184, 137, 44, 0.2)',
  blue: '#4a90c8',
  blueTransparent: 'rgba(74, 144, 200, 0.2)',
};

/** Theme-dependent chart chrome: axis text, grid, tooltip and the surface used for mark rings. */
export interface ChartChrome {
  text: string;
  grid: string;
  surface: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
}

/** Axis text meets 4.5:1 on its card surface in both themes. */
export const CHART_CHROME: Record<ThemeName, ChartChrome> = {
  dark: {
    text: '#cfc7b8',
    grid: 'rgba(255, 255, 255, 0.08)',
    surface: '#18181b',
    tooltipBackground: '#141416',
    tooltipBorder: '#5a4a2a',
    tooltipText: '#ece6da',
  },
  light: {
    text: '#5c554a',
    grid: 'rgba(0, 0, 0, 0.08)',
    surface: '#ffffff',
    tooltipBackground: '#ffffff',
    tooltipBorder: '#d6cdbb',
    tooltipText: '#1f1a14',
  },
};

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
