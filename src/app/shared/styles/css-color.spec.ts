import { cssColor, cssColorAlpha } from './css-color';

describe('cssColor', () => {
  const root = document.documentElement;

  afterEach(() => {
    root.style.removeProperty('--test-color');
  });

  it('reads a token from the root element', () => {
    root.style.setProperty('--test-color', ' #ffd54a ');
    expect(cssColor('--test-color')).toBe('#ffd54a');
  });

  it('is empty when the token is not defined (styles not loaded)', () => {
    expect(cssColor('--test-color')).toBe('');
    expect(cssColorAlpha('--test-color', 0.5)).toBe('');
  });

  it('adds the opacity to hex tokens as #rrggbbaa', () => {
    root.style.setProperty('--test-color', '#FFBE5A');
    expect(cssColorAlpha('--test-color', 1)).toBe('#ffbe5aff');
    expect(cssColorAlpha('--test-color', 0)).toBe('#ffbe5a00');
    expect(cssColorAlpha('--test-color', 0.55)).toBe('#ffbe5a8c');
  });

  it('expands short hex tokens', () => {
    root.style.setProperty('--test-color', '#fff');
    expect(cssColorAlpha('--test-color', 0.5)).toBe('#ffffff80');
  });

  it('mixes other notations with transparent', () => {
    root.style.setProperty('--test-color', 'rgb(1 2 3)');
    expect(cssColorAlpha('--test-color', 0.4)).toBe('color-mix(in srgb, rgb(1 2 3) 40%, transparent)');
  });
});
