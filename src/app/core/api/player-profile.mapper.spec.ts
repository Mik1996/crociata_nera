import { CocPlayer } from './coc-api.types';
import { mapPlayerProfile } from './coc-api.mappers';

function rawPlayer(): CocPlayer {
  return {
    tag: '#P1',
    name: 'Player one',
    townHallLevel: 17,
    townHallWeaponLevel: 3,
    expLevel: 250,
    trophies: 5000,
    bestTrophies: 5500,
    warStars: 1200,
    attackWins: 40,
    defenseWins: 2,
    role: 'admin',
    donations: 100,
    donationsReceived: 50,
    league: { id: 1, name: 'Legend League', iconUrls: { small: 's.png', medium: 'm.png' } },
    labels: [{ id: 1, name: 'Clan Wars', iconUrls: { small: 'label.png' } }],
    heroes: [
      { name: 'Barbarian King', level: 90, maxLevel: 100, village: 'home', equipment: [{ name: 'Giant Gauntlet', level: 20, maxLevel: 27, village: 'home' }] },
      { name: 'Battle Machine', level: 30, maxLevel: 35, village: 'builderBase' },
    ],
    troops: [
      { name: 'Barbarian', level: 12, maxLevel: 12, village: 'home' },
      { name: 'Super Barbarian', level: 1, maxLevel: 1, village: 'home', superTroopIsActive: true },
      { name: 'Super Archer', level: 1, maxLevel: 1, village: 'home' },
      { name: 'Sneaky Goblin', level: 1, maxLevel: 1, village: 'home' },
      { name: 'Wall Wrecker', level: 4, maxLevel: 5, village: 'home' },
      { name: 'L.A.S.S.I', level: 10, maxLevel: 15, village: 'home' },
      { name: 'Raged Barbarian', level: 18, maxLevel: 20, village: 'builderBase' },
      { name: 'Unknown Future Troop', level: 1, maxLevel: 10, village: 'home' },
    ],
    spells: [{ name: 'Lightning Spell', level: 11, maxLevel: 12, village: 'home' }],
    achievements: [{ name: 'War Hero', stars: 2, value: 600, target: 1000, info: 'Score stars', completionInfo: null, village: 'home' }],
  };
}

describe('mapPlayerProfile', () => {
  const p = mapPlayerProfile(rawPlayer());

  it('maps identity, league and labels with their official icons', () => {
    expect(p.role).toBe('elder');
    expect(p.townHallImage).toBe('game/town-halls/th-17.webp');
    expect(p.league).toEqual({ name: 'Legend League', icon: 'm.png' });
    expect(p.labels).toEqual([{ name: 'Clan Wars', icon: 'label.png' }]);
  });

  it('groups troops the way the game does, recognising super troops by name', () => {
    expect(p.troops.map((t) => t.name)).toEqual(['Barbarian', 'Unknown Future Troop']);
    expect(p.superTroops.map((t) => [t.name, t.active])).toEqual([
      ['Super Barbarian', true],
      ['Super Archer', false],
      ['Sneaky Goblin', false],
    ]);
    expect(p.siegeMachines.map((t) => t.name)).toEqual(['Wall Wrecker']);
    expect(p.pets.map((t) => t.name)).toEqual(['L.A.S.S.I']);
    expect(p.builderBaseTroops.map((t) => t.name)).toEqual(['Raged Barbarian']);
    expect(p.builderBaseHeroes.map((t) => t.name)).toEqual(['Battle Machine']);
  });

  it('attaches game icons when available and keeps hero equipment', () => {
    expect(p.troops[0].icon).toBe('game/units/barbarian.webp');
    expect(p.troops[1].icon).toBeUndefined();
    expect(p.heroes[0].equipment[0].name).toBe('Giant Gauntlet');
    expect(p.heroes[0].icon).toBe('game/units/barbarian-king.webp');
  });
});
