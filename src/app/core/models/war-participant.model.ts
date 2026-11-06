import { Attack } from './attack.model';

/** Player lined up in a war (clan or opponent side). */
export interface WarParticipant {
  tag: string;
  name: string;
  /** Town hall level. */
  townHall: number;
  /** Position on the war map (1 = top). */
  mapPosition: number;
  /** Attacks performed by this player. */
  attacks: Attack[];
  /** Number of attacks received as defender. */
  opponentAttacks: number;
  /** Best attack received from the opponent, if any. */
  bestOpponentAttack?: Attack;
}
