import { capitalHallImage, capitalLeagueIcon, warLeagueIcon } from './clan-assets';

describe('clan assets', () => {
  it('picks the Capital Hall picture by level', () => {
    expect(capitalHallImage(10)).toBe('game/capital-halls/capital-hall-10.webp');
    expect(capitalHallImage(3)).toBe('game/capital-halls/capital-hall-3.webp');
    expect(capitalHallImage(12)).toBe('game/capital-halls/capital-hall-10.webp');
    expect(capitalHallImage(0)).toBeNull();
  });

  it('maps Capital League names to their badge', () => {
    expect(capitalLeagueIcon('Legend League')).toBe('game/leagues/legend.webp');
    expect(capitalLeagueIcon('Master League II')).toBe('game/leagues/master.webp');
    expect(capitalLeagueIcon(undefined)).toBeNull();
  });

  it('maps Clan War League names to the trophy of the right division', () => {
    expect(warLeagueIcon('Master League I')).toBe('game/war-leagues/master-1.webp');
    expect(warLeagueIcon('Crystal League III')).toBe('game/war-leagues/crystal-3.webp');
    expect(warLeagueIcon('Champion League II')).toBe('game/war-leagues/champion-2.webp');
    expect(warLeagueIcon('Titan League I')).toBeNull();
    expect(warLeagueIcon(undefined)).toBeNull();
  });
});
