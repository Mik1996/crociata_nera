import { ClanRole } from './clan.model';

export type Village = 'home' | 'builderBase' | 'clanCapital';

/** Hero, troop, spell, siege machine, pet or hero equipment with its level. */
export interface PlayerUnit {
  name: string;
  village: Village;
  level: number;
  maxLevel: number;
  /** Icon from the game assets, when available. */
  icon?: string;
}

export interface PlayerHero extends PlayerUnit {
  /** Equipment currently assigned to the hero. */
  equipment: PlayerUnit[];
}

/** Named item with an official icon (league, league tier, label). */
export interface IconItem {
  name: string;
  icon?: string;
}

export interface PlayerAchievement {
  name: string;
  /** 0–3 stars. */
  stars: number;
  value: number;
  target: number;
  info: string;
  completionInfo?: string;
  village: Village;
}

/** Full profile of a player (`GET /players/{tag}`), grouped for display. */
export interface PlayerProfile {
  tag: string;
  name: string;
  role?: ClanRole;
  expLevel: number;
  townHall: number;
  townHallImage?: string;
  townHallWeapon?: number;
  trophies: number;
  bestTrophies: number;
  league?: IconItem;
  leagueTier?: IconItem;
  legendTrophies?: number;
  /** Rank in the current Legend League season, if any. */
  legendRank?: number;
  warStars: number;
  warPreference?: 'in' | 'out';
  attackWins: number;
  defenseWins: number;
  donations: number;
  donationsReceived: number;
  capitalContributions: number;
  builderHall?: number;
  builderBaseTrophies?: number;
  bestBuilderBaseTrophies?: number;
  builderBaseLeague?: string;
  clan?: { tag: string; name: string; level: number; badgeUrl?: string };
  labels: IconItem[];
  heroes: PlayerHero[];
  /** Home village troops (no super troops, siege machines or pets). */
  troops: PlayerUnit[];
  superTroops: (PlayerUnit & { active: boolean })[];
  siegeMachines: PlayerUnit[];
  pets: PlayerUnit[];
  spells: PlayerUnit[];
  heroEquipment: PlayerUnit[];
  builderBaseHeroes: PlayerUnit[];
  builderBaseTroops: PlayerUnit[];
  achievements: PlayerAchievement[];
}
