import { describe, expect, it } from 'vitest';
import { announcementTexts } from '@/modules/announcements/announcement-texts';
import { SvgText } from '@/modules/announcements/image/svg-text';

const options = { font: 'bold' as const, size: 40, x: 0, y: 100, fill: '#f0c96a' };

describe('SvgText', () => {
  it('draws the letters of its fonts as paths', async () => {
    const text = await SvgText.create();
    const svg = text.draw('Mik', options);
    expect(svg).toMatch(/^<path d="M[^"]+" fill="#f0c96a"\/>$/);
    expect(svg).not.toContain('<image');
  });

  it('draws emoji in names as pictures in their colours', async () => {
    const text = await SvgText.create();
    await text.prepare(['⚡️NICO⚡️']);
    const svg = text.draw('⚡️NICO⚡️', options);
    expect(svg.match(/<image href="data:image\/png;base64,/g)).toHaveLength(2);
    // Emoji keep their colours: no tint.
    expect(svg).not.toContain('filter=');
    expect(text.clean('⚡️NICO⚡️', 'bold')).toBe('⚡️NICO⚡️');
    expect(text.width('⚡️NICO⚡️', 'bold', 40)).toBeGreaterThan(text.width('NICO', 'bold', 40) + 40);
  });

  it('draws other scripts as pictures painted with the colour of the text', async () => {
    const text = await SvgText.create();
    await text.prepare(['☆ハーレイ・クイン・ナウ', 'gioᴰ·ᴶ']);
    const japanese = text.draw('☆ハーレイ・クイン・ナウ', options);
    expect(japanese).toContain('<path d="M'); // ☆ is in the font
    expect(japanese).toContain('<image');
    expect(japanese).toContain('<feFlood flood-color="#f0c96a"/>');
    expect(japanese).toContain('filter="url(#tint-f0c96a)"');
    expect(text.draw('gioᴰ·ᴶ', options)).toContain('<image');
  });

  it('leaves out what was never prepared', async () => {
    const text = await SvgText.create();
    expect(text.clean('⚡️NICO⚡️', 'bold')).toBe('NICO');
    expect(text.draw('⚡️NICO⚡️', options)).not.toContain('<image');
  });

  it('wraps and cuts names keeping their pictures whole', async () => {
    const text = await SvgText.create();
    const names = ['♠️♥️El_Lupo♥️♠️', 'Filippo 2☣️', '☠WEDNESDAY☠'];
    await text.prepare(names);
    const lines = text.wrap(names, 'regular', 28, 400);
    expect(lines.join(' · ')).toBe(names.join(' · '));
    const cut = text.draw('♠️♥️El_Lupo♥️♠️ ♠️♥️El_Lupo♥️♠️', { ...options, maxWidth: 200 });
    expect(cut).toContain('<image');
  });
});

describe('places in the announcements', () => {
  it('have the thousands separator of the language', () => {
    expect(announcementTexts('it-IT').place(3120)).toBe('3.120°');
    expect(announcementTexts('en-US').place(3120)).toBe('#3,120');
    expect(announcementTexts('es-ES').place(3120)).toBe('3.120.º');
    expect(announcementTexts('it-IT').place(14)).toBe('14°');
  });
});
