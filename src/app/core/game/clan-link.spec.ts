import { clanProfileLink } from './clan-link';

describe('clanProfileLink', () => {
  it('opens the clan profile in the game, in the user language, with the tag encoded', () => {
    expect(clanProfileLink('#2JU8RPR2G', 'es-ES')).toBe(
      'https://link.clashofclans.com/es?action=OpenClanProfile&tag=%232JU8RPR2G',
    );
  });
});
