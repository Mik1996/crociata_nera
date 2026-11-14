import { clanCastleCapacity } from './clan-castle';
import { townHallImage } from './units';

describe('townHallImage', () => {
  it('returns the picture of each known level', () => {
    expect(townHallImage(1)).toBe('game/town-halls/th-1.webp');
    expect(townHallImage(18)).toBe('game/town-halls/th-18.webp');
    expect(townHallImage(19)).toBe('game/town-halls/th-19.webp');
  });

  it('falls back to the highest picture for a town hall newer than the assets', () => {
    expect(townHallImage(20)).toBe('game/town-halls/th-19.webp');
  });

  it('falls back to the lowest picture below level 1', () => {
    expect(townHallImage(0)).toBe('game/town-halls/th-1.webp');
  });
});

describe('clanCastleCapacity', () => {
  it('has no castle before TH3', () => {
    expect(clanCastleCapacity(2)).toBe(0);
  });

  it('holds 60 spaces at TH19', () => {
    expect(clanCastleCapacity(19)).toBe(60);
  });

  it('uses the highest known capacity for town halls not in the table yet', () => {
    expect(clanCastleCapacity(20)).toBe(60);
  });
});
