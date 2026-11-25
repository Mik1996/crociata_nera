import { cssColor, cssColorAlpha } from '../styles/css-color';

/**
 * Paints brushed black iron over a `width × height` canvas, as the site's "iron" theme: a warm sheen
 * at the top, the ember glow at the foot, a dark crimson vignette and fine horizontal strokes (the
 * same every time: seeded). Shared by the PDFs (`PdfToolkit.ironPlate`) and the share cards.
 */
export function paintIronPlate(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const w = width;
  const h = height;
  context.fillStyle = cssColor('--cn-pdf-iron-bg');
  context.fillRect(0, 0, w, h);
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y += 2) {
    context.fillStyle = cssColorAlpha('--cn-pdf-iron-text', 0.006 + random() * 0.018);
    const x = random() * w * 0.3;
    context.fillRect(x, y, w * (0.5 + random() * 0.5), 1);
  }
  const size = Math.max(w, h);
  const sheen = context.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, size * 0.55);
  sheen.addColorStop(0, cssColorAlpha('--cn-pdf-gold-text', 0.1));
  sheen.addColorStop(1, cssColorAlpha('--cn-pdf-gold-text', 0));
  context.fillStyle = sheen;
  context.fillRect(0, 0, w, h);
  const ember = context.createRadialGradient(w * 0.6, h * 1.08, 0, w * 0.6, h * 1.08, size * 0.5);
  ember.addColorStop(0, cssColorAlpha('--cn-pdf-iron-ember', 0.3));
  ember.addColorStop(1, cssColorAlpha('--cn-pdf-iron-ember', 0));
  context.fillStyle = ember;
  context.fillRect(0, 0, w, h);
  const vignette = context.createRadialGradient(w / 2, h / 2, size * 0.3, w / 2, h / 2, size * 0.78);
  vignette.addColorStop(0, cssColorAlpha('--cn-pdf-iron-crimson', 0));
  vignette.addColorStop(1, cssColorAlpha('--cn-pdf-iron-crimson', 0.4));
  context.fillStyle = vignette;
  context.fillRect(0, 0, w, h);
}
