/** Colour of a clan of the Crusade: its Crusader and the tones of its act on the welcome page. */
export type CrusadeOrder = 'black' | 'red' | 'gold';

/** A sister clan of Crociata Nera, presented on the welcome page. */
export interface SisterClan {
  tag: string;
  /** Shown while the clan is loading and in the mock data; the page uses the name from the API. */
  name: string;
  order: Exclude<CrusadeOrder, 'black'>;
}

/** Sister clans, in display order: the second CWL, then the parallel wars during the CWL. */
export const SISTER_CLANS: readonly SisterClan[] = [
  { tag: '#2JU8RPR2G', name: 'Crociata Rossa', order: 'red' },
  { tag: '#2RRYUGQYJ', name: "Crociata d'Oro", order: 'gold' },
];
