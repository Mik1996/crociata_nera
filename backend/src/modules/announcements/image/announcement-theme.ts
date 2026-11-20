/**
 * Colours of the announcement pictures: the "iron" look of the PDFs. Copied from the `--cn-pdf-*`
 * tokens of `src/styles/_color-palette.scss` (the frontend's single source of colours, which the
 * backend cannot read): keep the two in step.
 */
export const IRON_THEME = {
  /** `--cn-pdf-iron-bg`: page. */
  background: '#0d0a0b',
  /** `--cn-pdf-iron-plate`: panels. */
  plate: '#1b1718',
  /** `--cn-pdf-iron-stripe`: lighter side of the brushed plate. */
  stripe: '#241e1f',
  /** `--cn-pdf-iron-tile`: tiles of the figures. */
  tile: '#2a2425',
  /** `--cn-pdf-iron-edge`: outlines of panels and tiles. */
  edge: '#4a3a22',
  /** `--cn-pdf-iron-line`: lines between rows. */
  line: '#342b2c',
  /** `--cn-pdf-iron-text`: body text. */
  text: '#f2ead8',
  /** `--cn-pdf-iron-muted`: labels, notes. */
  muted: '#b9aa9a',
  /** `--cn-pdf-iron-ember`: glow at the foot of the page, thin rule under the header. */
  ember: '#ff6e1e',
  /** `--cn-pdf-iron-crimson`: vignette. */
  crimson: '#6a1216',
  /** `--cn-pdf-gold`: frame, studs, rules. */
  gold: '#d9a93f',
  /** `--cn-pdf-gold-text`: titles and values. */
  goldText: '#f0c96a',
  /** `--cn-pdf-danger`: values that need attention. */
  danger: '#ff7a6b',
  /** `--cn-pdf-reserve`: good news (victories). */
  good: '#4ed97a',
} as const;
