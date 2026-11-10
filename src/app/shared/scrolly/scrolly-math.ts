/**
 * Pure maths of the scrollytelling engine: how far an act has travelled through the scrollport,
 * plus the small helpers the effects use (segments, easing, roman numerals).
 */

/** Where an act is compared with the scrollport. */
export type ActState = 'before' | 'active' | 'after';

/** Measures of one act in a frame. Every ratio is between 0 and 1. */
export interface ActMetrics {
  /** 0 while the top of the act is under the bottom of the scrollport, 1 once it reaches the top. */
  enter: number;
  /**
   * Main progress. Act taller than the scrollport (pinned acts): 0 when its top reaches the top of
   * the scrollport, 1 when its bottom reaches the bottom. Shorter act: 0 once it is fully visible
   * at the bottom, 1 when it touches the top.
   */
  progress: number;
  /** 0 while the bottom of the act is under the bottom of the scrollport, 1 once it reaches the top. */
  exit: number;
  /** Whole journey: 0 when the act starts entering, 1 when it has completely left. */
  span: number;
  /** Top of the act from the top of the scrollport, in px (negative once scrolled past). */
  top: number;
  height: number;
  viewport: number;
  state: ActState;
  /** Within one scrollport from being visible: time to load heavy content. */
  near: boolean;
}

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Progress of `value` inside the `[start, end]` part of a 0–1 range, from 0 to 1. */
export function segment(value: number, start: number, end: number): number {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
}

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

/** Metrics of an act whose top is `top` px under the top of a `viewport` px tall scrollport. */
export function measureAct(top: number, height: number, viewport: number): ActMetrics {
  const bottom = top + height;
  // Pinned acts run from top = 0 to top = viewport − height (negative), shorter ones the other way.
  const from = Math.max(0, viewport - height);
  const to = Math.min(0, viewport - height);
  const progress = from === to ? (top <= from ? 1 : 0) : clamp01((from - top) / (from - to));
  const state: ActState = top >= viewport ? 'before' : bottom <= 0 ? 'after' : 'active';
  return {
    enter: viewport > 0 ? clamp01((viewport - top) / viewport) : 1,
    progress,
    exit: viewport > 0 ? clamp01((viewport - bottom) / viewport) : 0,
    span: viewport + height > 0 ? clamp01((viewport - top) / (viewport + height)) : 0,
    top,
    height,
    viewport,
    state,
    near: top < viewport * 2 && bottom > -viewport,
  };
}

/** Final state shown without animations (reduced motion, no layout): everything revealed. */
export function staticMetrics(height = 0): ActMetrics {
  return {
    enter: 1,
    progress: 1,
    exit: 0,
    span: 0.5,
    top: 0,
    height,
    viewport: 0,
    state: 'active',
    near: true,
  };
}

const ROMAN: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Roman numeral of a positive integer (act numbers); empty for 0 or less. */
export function toRoman(value: number): string {
  let rest = Math.floor(value);
  let out = '';
  for (const [n, symbol] of ROMAN) {
    while (rest >= n) {
      out += symbol;
      rest -= n;
    }
  }
  return out;
}
