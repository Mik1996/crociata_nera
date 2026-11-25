import { wrapText } from '../pdf/pdf-toolkit';

/**
 * A picture to post on social apps and chats (WhatsApp, Instagram, Telegram…) in the "iron" look of
 * the site: a medal in 3D with what it is, who earned it and when. Drawn in the browser by
 * `ShareCardRenderer`; this file holds what can be computed without a canvas.
 */

/** `square` for posts and chats, `story` for Instagram and WhatsApp stories (9:16). */
export type ShareCardFormat = 'square' | 'story';

/** Size of each format in pixels: the sizes Instagram recommends. */
export const SHARE_CARD_SIZES: Readonly<Record<ShareCardFormat, { width: number; height: number }>> =
  {
    square: { width: 1080, height: 1080 },
    story: { width: 1080, height: 1920 },
  };

/** Host name printed at the foot of the card and linked by the caption. */
export const SHARE_SITE = 'crociatanera.it';

/** What a card shows, already translated. */
export interface ShareCard {
  format: ShareCardFormat;
  /** Small caps line over the medal, e.g. "Commendation earned". */
  kicker: string;
  /** Name of the commendation. */
  title: string;
  /** Tier label and its metal (graded commendations only). */
  tier: { label: string; metal: 'bronze' | 'silver' | 'gold' } | null;
  /** Flat SVG of the medal (`public/commendations/…`), used without WebGL. */
  medalSvg: string;
  /** The medal in 3D (object URL from `MedalSnapshots.still`), `null` without WebGL. */
  medal3d: string | null;
  /** Who earned it (any script, emoji included). */
  player: string;
  /** When or how many times, e.g. "October 2026", "Earned 3 times". */
  detail: string;
  /** Requirement of the commendation (story format only: the square has no room for it). */
  description: string;
  clan: string;
  /** Clan crest URL (same origin: drawn on the canvas). */
  crest: string;
  /** Supercell's fan content notice, required on fan-made material. */
  fanContent: string;
}

/** A text fitted in a box: the font size it got and its lines. */
export interface FittedText {
  size: number;
  lines: string[];
}

/**
 * Fits a text in `maxWidth`: the largest size from `maxSize` down to `minSize` (steps of 2) at which
 * it stays on one line; below that, wrapped at `minSize` over at most `maxLines` lines (the last
 * one ending in "…" when it does not fit). `measure(text, size)` is the width of the text.
 */
export function fitText(
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  maxLines: number,
  measure: (text: string, size: number) => number,
): FittedText {
  for (let size = maxSize; size >= minSize; size -= 2) {
    if (measure(text, size) <= maxWidth) return { size, lines: [text] };
  }
  const width = (s: string) => measure(s, minSize);
  const lines = wrapText(text, maxWidth, width);
  if (lines.length <= maxLines) return { size: minSize, lines };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last && width(`${last}…`) > maxWidth) last = [...last].slice(0, -1).join('');
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return { size: minSize, lines: kept };
}

/** A hashtag made of a name: letters and digits only, e.g. "Crociata Nera" → "#CrociataNera". */
export function hashtagOf(name: string): string {
  return '#' + name.replace(/[^\p{L}\p{N}]/gu, '');
}

/** File name of a card, e.g. `crociata-nera-champion-gold-square.png`. */
export function shareCardFileName(clan: string, emblem: string, format: ShareCardFormat): string {
  const slug = clan
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${slug || 'clan'}-${emblem}-${format}.png`;
}
