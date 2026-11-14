/** Types of the application backend (`backend/`). Keep in sync with `backend/src`. */

import { ClanCastleTroop } from '../game/clan-castle';

export interface BackendMessage {
  /** Translation key, e.g. `ERROR.INVALID_CREDENTIALS`. */
  key: string;
  params?: Record<string, string | number>;
  /** Request field the message refers to (validation errors). */
  field?: string;
}

/** Envelope of every backend response. */
export interface BaseResult<T> {
  result: T | null;
  messages: BackendMessage[];
  status: { code: number; name: string };
}

export interface LinkedPlayer {
  tag: string;
  /** Proven with the in-game API token. */
  verified: boolean;
}

export interface BackendUser {
  id: string;
  email: string;
  username: string;
  roles: ('USER' | 'ADMIN')[];
  /** Linked Clash of Clans accounts; `verified: false` only for links made before the token check. */
  players: LinkedPlayer[];
  emailVerified: boolean;
  /**
   * Full access to the site: administrator, or a verified account currently in Crociata Nera,
   * Crociata Rossa or Crociata d'Oro. Without it only the public pages are open.
   */
  clanAccess: boolean;
  /**
   * Access to the leaders' pages (CWL line-up): administrator, or a verified account that is
   * leader or co-leader of a clan of the Crusade.
   */
  leaderAccess: boolean;
  createdAt: string;
}

/** Result of sign-up, sign-in and refresh (the refresh token travels in an httpOnly cookie). */
export interface AuthResult {
  user: BackendUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface SignUpRequest {
  email: string;
  username: string;
  password: string;
  repeatPassword: string;
  /** Language of the confirmation email. */
  language?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  password: string;
  repeatPassword: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  repeatPassword: string;
}

/** User as listed in the administration page. */
export interface AdminUser extends BackendUser {
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SignInRequest {
  /** Email or username. */
  identifier: string;
  password: string;
}

/**
 * A commendation earned, as saved by the backend. Translated from `type` and `tier`
 * (`commendations.<type>.<tier>`).
 */
export interface EarnedCommendation {
  /** Unique id of the commendation (backend catalogue, e.g. `95000015`). */
  id: string;
  /** `<type>-<tier>`, e.g. `capitalRaider-gold` (also the name of the medal image). */
  name: string;
  type: string;
  tier: string;
  quantity: number;
}

/** `GET /api/v1/players/{tag}`: a saved player (current or former member) and the commendations earned. */
export interface PlayerRecord {
  tag: string;
  name: string;
  role: string | null;
  townHallLevel: number | null;
  expLevel: number | null;
  trophies: number | null;
  league: { id: number; name: string; iconUrl?: string } | null;
  inClan: boolean;
  lastSeenAt: string | null;
  commendations: EarnedCommendation[];
}

/** A defense base of the arsenal (`GET /bases`). */
export interface DefenseBase {
  id: string;
  /** From the layout link (`TH18:HV:…`). */
  townHallLevel: number;
  /** In-game "copy base" link. */
  layoutUrl: string;
  description: string;
  /** Clan castle reinforcements recommended for the base; empty when not given. */
  clanCastleTroops: ClanCastleTroop[];
  /** Screenshot: `/base-images/{key}/thumb|full`; `width`/`height` of the full image. */
  image: { key: string; width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

/** A page of the arsenal (`GET /bases`). */
export interface DefenseBasePage {
  /** Highest town hall first, then the most recently changed. */
  items: DefenseBase[];
  /** Pass it to get the next page; `null` on the last page. */
  nextCursor: string | null;
  /** Town hall levels with at least one base, whatever the filter, highest first. */
  townHallLevels: number[];
}

/** Fields sent to create (all but `description` required) or change (only the changed ones) a base. */
export interface DefenseBaseChanges {
  layoutUrl?: string;
  description?: string;
  /** `[]` removes the reinforcements. */
  clanCastleTroops?: ClanCastleTroop[];
  image?: Blob;
}

/** Place of a player in the ranking for the CWL line-up. */
export type CwlSelectionStatus = 'starter' | 'reserve' | 'bench' | 'ineligible' | 'excluded';

/** Exclusion of a player from the CWL line-up, decided by an administrator. */
export interface CwlExclusion {
  reason: string | null;
  /** Username of the administrator. */
  excludedBy: string;
  excludedAt: string;
}

/** Parts of the score of a player for the CWL line-up (penalties are negative). */
export interface CwlScoreBreakdown {
  /** 0–30. */
  cwlCommendations: number;
  /** 0–20. */
  cwlPerformance: number;
  /** 0–25. */
  war: number;
  /** 0–15. */
  heroes: number;
  /** 10 for the highest town hall of the clan, else 0. */
  townHall: number;
  /** -15–0. */
  missedAttacks: number;
  /** -15–0. */
  activity: number;
}

/** A current member of the clan in the ranking for the CWL line-up (`GET /cwl/selection`). */
export interface CwlSelectionPlayer {
  rank: number;
  tag: string;
  name: string;
  role: string | null;
  townHallLevel: number | null;
  /** Town hall at most one level below the highest of the clan, and not excluded. */
  eligible: boolean;
  status: CwlSelectionStatus;
  /** 0–100: the parts of `breakdown` added up, never below 0. */
  score: number;
  breakdown: CwlScoreBreakdown;
  war: {
    wars: number;
    attacksUsed: number;
    attacksAvailable: number;
    averageStarsPerAttack: number;
    averageDestruction: number;
  };
  /** CWL commendations and league wars of the seasons considered. */
  cwl: {
    allAttacks: number;
    gold: number;
    silver: number;
    bronze: number;
    wars: number;
    attacks: number;
    missed: number;
    averageStarsPerAttack: number;
    averageDestruction: number;
  };
  /** Percentages of the highest levels of the game; `null` while the profile was never read. */
  heroes: { levels: number; equipment: number } | null;
  activity: {
    joinedAt: string | null;
    newcomer: boolean;
    inactive: boolean;
    recentAttacks: number;
  };
  exclusion: CwlExclusion | null;
}

/** Ranking of the clan members for the CWL line-up, best first. */
export interface CwlSelection {
  generatedAt: string;
  starters: number;
  reserves: number;
  maxTownHall: number | null;
  minEligibleTownHall: number | null;
  /** Ended CWL seasons considered (`YYYY-MM`), most recent first. */
  seasons: string[];
  warWindow: { from: string; days: number; wars: number };
  players: CwlSelectionPlayer[];
}
