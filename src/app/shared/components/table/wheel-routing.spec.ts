import { ScrollBox, wheelTarget } from './wheel-routing';

describe('wheelTarget', () => {
  const box = (scrollTop: number, scrollHeight = 1000, clientHeight = 400): ScrollBox => ({
    scrollTop,
    scrollHeight,
    clientHeight,
  });
  const UP = -50;
  const DOWN = 50;

  it('scrolls the page until the table is entirely in view', () => {
    expect(wheelTarget(DOWN, box(0), box(0), false)).toBe('page');
  });

  it('scrolls the table while it is in view and can still move', () => {
    expect(wheelTarget(DOWN, box(0), box(600), true)).toBe('table');
    expect(wheelTarget(UP, box(300), box(600), true)).toBe('table');
  });

  it('hands the scroll back to the page at the top of the table, at the bottom of the page', () => {
    expect(wheelTarget(UP, box(0), box(600), true)).toBe('page');
  });

  it('hands the scroll to the page at the bottom of the table', () => {
    expect(wheelTarget(DOWN, box(600), box(100), true)).toBe('page');
  });

  it('leaves it to the table when the page cannot move either', () => {
    expect(wheelTarget(UP, box(0), box(0), false)).toBe('table');
    expect(wheelTarget(DOWN, box(600), box(600), true)).toBe('table');
  });
});
