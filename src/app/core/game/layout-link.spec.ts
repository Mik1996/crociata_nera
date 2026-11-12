import { layoutLinkTownHall } from './layout-link';

const link = (id: string, lang = 'en') =>
  `https://link.clashofclans.com/${lang}?action=OpenLayout&id=${id}`;

describe('layoutLinkTownHall', () => {
  it('reads the town hall level of a home village layout link', () => {
    expect(layoutLinkTownHall(link('TH18%3AHV%3AAAAAFQAAAALRVVKKOsCkPrNIeGUyK9Qd'))).toBe(18);
    expect(layoutLinkTownHall(`  ${link('TH9%3AHV%3AAbc_12-xyz', 'IT')}  `)).toBe(9);
    // Language path with a trailing slash.
    expect(
      layoutLinkTownHall(
        'https://link.clashofclans.com/en/?action=OpenLayout&id=TH17%3AWB%3AAAAALQAAAAKlk0CYkuJc1V-zUS8yaH6u',
      ),
    ).toBe(17);
    // War base layout.
    expect(layoutLinkTownHall(link('TH18%3AWB%3AAAAAFAAAAALLzhLmlzF4S8AYmJtI0bdX', 'it'))).toBe(18);
    expect(
      layoutLinkTownHall('https://link.clashofclans.com/?id=TH12%3AHV%3AAbcdefgh&action=OpenLayout'),
    ).toBe(12);
  });

  it('refuses anything else', () => {
    for (const text of [
      '',
      'TH18:HV:AAAAFQAAAALR',
      'http://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALR',
      'https://link.clashofclans.com.evil.io/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALR',
      'https://link.clashofclans.com/en?action=OpenClanProfile&tag=%232J8JVVCLC',
      link('BH10%3ABB%3AAAAAFQAAAALR'),
      link('TH0%3AHV%3AAAAAFQAAAALR'),
      link('TH18%3AHV%3Ashort'),
      link('TH18%3AHV%3A%E0%A4%A'),
    ]) {
      expect(layoutLinkTownHall(text), text).toBeNull();
    }
  });
});
