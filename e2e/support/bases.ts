import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** The part of sharp (the backend's, no extra dependency for the e2e suite) used here. */
type Sharp = (options: {
  create: {
    width: number;
    height: number;
    channels: 3;
    background: { r: number; g: number; b: number };
  };
}) => { png(): { toBuffer(): Promise<Buffer> } };
const sharp = createRequire(join(__dirname, '../../backend/package.json'))('sharp') as Sharp;

/** An in-game "copy base" link of a home village base, with a layout id never used before. */
export function layoutLink(townHall: number): string {
  const id = `AAAAFQAAAAL${randomBytes(16).toString('base64url').replace(/[-_]/g, 'x')}`;
  return `https://link.clashofclans.com/en?action=OpenLayout&id=TH${townHall}%3AHV%3A${id}`;
}

/** A screenshot of a base: a real PNG the browser and the backend can decode. */
export async function basePicture(): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const buffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 40 + Math.floor(Math.random() * 100), g: 110, b: 70 },
    },
  })
    .png()
    .toBuffer();
  return { name: 'base.png', mimeType: 'image/png', buffer };
}
