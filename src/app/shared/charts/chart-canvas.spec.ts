import { Component, viewChildren } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Chart, ChartData, registry } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { CHART_REGISTERABLES, ChartCanvas } from './chart-canvas';
import { barSeries, baseChartOptions, ChartChrome, lineSeries } from './chart-theme';

const chrome: ChartChrome = {
  series1: '#c9a227',
  series1Fill: 'rgba(201, 162, 39, 0.2)',
  series2: '#4a90d9',
  text: '#ddd',
  grid: '#444',
  surface: '#111',
  tooltipBackground: '#222',
  tooltipBorder: '#555',
  tooltipText: '#eee',
};

@Component({
  imports: [ChartCanvas],
  template: `
    <canvas crnChart type="line" [data]="line" [options]="lineOptions"></canvas>
    <canvas crnChart type="bar" [data]="bar" [options]="barOptions"></canvas>
  `,
})
class Host {
  readonly charts = viewChildren(BaseChartDirective);
  readonly line: ChartData<'line', number[]> = {
    labels: ['01/11', '02/11'],
    datasets: [lineSeries('Stars', [1, 2], chrome.series1, chrome, chrome.series1Fill)],
  };
  readonly lineOptions = baseChartOptions(chrome, { min: 0 });
  readonly bar: ChartData<'bar', number[]> = {
    labels: ['01/11', '02/11'],
    datasets: [barSeries('Attacks', [3, 4], chrome.series2, chrome)],
  };
  readonly barOptions = baseChartOptions<'bar'>(chrome, { legend: false });
}

/**
 * jsdom has no canvas: a 2D context that accepts every call, enough for Chart.js to build and
 * "draw" its charts.
 */
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const noop = () => undefined;
  return new Proxy({ canvas } as Record<string | symbol, unknown>, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'length') return undefined; // not an array of canvases
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'getLineDash') return () => [];
      return noop;
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe('ChartCanvas', () => {
  const getContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      return fakeContext(this);
    } as never;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = getContext;
    vi.unstubAllGlobals();
  });

  it('registers only the parts of Chart.js the site uses, before drawing the charts', async () => {
    // The registry is global and other specs (pages with charts) may have filled it already.
    Chart.unregister(...CHART_REGISTERABLES);
    expect(() => registry.getController('line')).toThrow(); // nothing registered at startup

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    const charts = fixture.componentInstance.charts().map((d) => d.chart);
    expect(charts.map((c) => (c?.config as { type?: string } | undefined)?.type)).toEqual([
      'line',
      'bar',
    ]);
    expect(charts.every((c) => c instanceof Chart)).toBe(true);
    // Line area fills, legend and tooltip are there; what the site does not use is not.
    for (const id of ['filler', 'legend', 'tooltip']) expect(registry.getPlugin(id)).toBeDefined();
    expect(() => registry.getController('pie')).toThrow();
    expect(() => registry.getScale('time')).toThrow();
    // Global defaults set with the registration.
    expect(Chart.defaults.maintainAspectRatio).toBe(false);
    expect(Chart.defaults.font.family).toContain('Inter');
    // The datasets were built with the registered controllers and scales.
    expect(charts[0]!.getDatasetMeta(0).controller).toBeDefined();
    expect(Object.keys(charts[1]!.scales)).toEqual(['x', 'y']);
  });
});
