import { initials } from './initials';

describe('initials', () => {
  it('takes the first letter of each word, up to the maximum', () => {
    expect(initials('Electro Dragon')).toBe('ED');
    expect(initials('super wall breaker')).toBe('SW');
    expect(initials('  michele  ', 1)).toBe('M');
    expect(initials('Royal Champion', 1)).toBe('R');
  });

  it('copes with empty names and non-Latin letters', () => {
    expect(initials('')).toBe('');
    expect(initials('éclair')).toBe('É');
  });
});
