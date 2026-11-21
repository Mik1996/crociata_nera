/**
 * Colours of the announcement pictures: the "iron" look of the PDFs. Copied from the `--cn-pdf-*`
 * tokens of `src/styles/_color-palette.scss` (the frontend's single source of colours, which the
 * backend does not read at run time, as it is not in its image): {@link PALETTE_TOKENS} names the
 * token of each, and a test fails when the two drift apart.
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
  /** Electro leagues (promotions): `--cn-pdf-starter` and its lighter and darker shades. */
  electro: '#4fa8ff',
  electroLight: '#c4e6ff',
  electroDeep: '#0b2747',
  /** Legend leagues (promotions): fire orange and its lighter and darker shades. */
  legend: '#ff8a1e',
  legendLight: '#ffd27a',
  legendDeep: '#5a1d04',
  /** Division tag of the Legend league badges (as the game draws it): box, its edge, the numerals. */
  divisionBox: '#151413',
  divisionEdge: '#5c5853',
  divisionNumeral: '#f8efc2',
} as const;

/**
 * Token of `src/styles/_color-palette.scss` each colour is copied from (`test/announcement-theme.test.ts`
 * compares them). Colours of the pictures only (league shades, division tags) have none.
 */
export const PALETTE_TOKENS: Partial<Record<keyof typeof IRON_THEME, string>> = {
  background: '--cn-pdf-iron-bg',
  plate: '--cn-pdf-iron-plate',
  stripe: '--cn-pdf-iron-stripe',
  tile: '--cn-pdf-iron-tile',
  edge: '--cn-pdf-iron-edge',
  line: '--cn-pdf-iron-line',
  text: '--cn-pdf-iron-text',
  muted: '--cn-pdf-iron-muted',
  ember: '--cn-pdf-iron-ember',
  crimson: '--cn-pdf-iron-crimson',
  gold: '--cn-pdf-gold',
  goldText: '--cn-pdf-gold-text',
  danger: '--cn-pdf-danger',
  good: '--cn-pdf-reserve',
  electro: '--cn-pdf-starter',
};
