import { CommendationTier, CommendationType } from '@/modules/commendations/commendation-rules';
import type { RecordName } from './announcement-data';

/**
 * Italian words of the announcements (the channel is Italian). Names of the commendations as in
 * `public/i18n/it-IT.json` (`commendations.<type>.<tier>`): keep them in step.
 */
export const COMMENDATION_LABELS: Readonly<Record<CommendationType, Partial<Record<CommendationTier, string>>>> = {
  cwlAllAttacks: { legendary: 'Certezza di Lega' },
  champion: { bronze: 'Valoroso', silver: 'Condottiero', gold: 'Signore della Guerra' },
  perfect: { bronze: 'Mano Ferma', silver: 'Spada Implacabile', gold: 'Lama Infallibile' },
  giantSlayer: { bronze: 'Temerario', silver: 'Cacciatore di Giganti', gold: 'Flagello dei Titani' },
  cwlStriker: { bronze: 'Guerriero di Lega', silver: 'Campione di Lega', gold: 'Leggenda della Lega' },
  capitalRaider: { bronze: 'Razziatore', silver: 'Predatore della Capitale', gold: 'Conquistatore di Capitali' },
  donor: { bronze: 'Portatore di Rinforzi', silver: 'Signore delle Legioni', gold: 'Padre degli Eserciti' },
  wall: { bronze: 'Scudo Saldo', silver: "Bastione d'Acciaio", gold: 'Muro Invalicabile' },
  tireless: { bronze: 'Soldato Fedele', silver: 'Veterano Instancabile', gold: 'Braccio Indomito' },
  present: { bronze: "Presente all'Appello", silver: 'Pilastro del Clan', gold: 'Sempre in Prima Linea' },
};

export const TIER_LABELS: Readonly<Record<CommendationTier, string>> = {
  legendary: 'Leggendario',
  gold: 'Oro',
  silver: 'Argento',
  bronze: 'Bronzo',
};

/** Name of a record, as on the welcome page (`welcome.records.*`). */
export const RECORD_LABELS: Readonly<Record<RecordName, string>> = {
  perfectWars: 'Guerre perfette',
  warWinStreak: 'Serie di vittorie in guerra',
  cwlLeague: 'Miglior lega CWL',
  localRank: 'Miglior posizione in Italia',
  localCapitalRank: 'Miglior posizione capitale in Italia',
  capitalPoints: 'Record trofei capitale',
};

const MONTH_NAME = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `2026-11` -> `Novembre 2026`. */
export function monthLabel(month: string): string {
  const label = MONTH_NAME.format(new Date(`${month}-15T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const NUMBER = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' });

/** Italian number: `9.000`, `12.345`, `2,57` (thousands always grouped, also with four digits). */
export function formatNumber(value: number, decimals?: number): string {
  if (decimals === undefined) return NUMBER.format(value);
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: 'always',
  }).format(value);
}

/** Italian names of the home village leagues (the API writes them in English). */
const LEAGUE_NAMES: Readonly<Record<string, string>> = {
  Skeleton: 'Scheletro',
  Barbarian: 'Barbaro',
  Archer: 'Arciere',
  Wizard: 'Stregone',
  Valkyrie: 'Valchiria',
  Witch: 'Strega',
  Golem: 'Golem',
  'P.E.K.K.A': 'P.E.K.K.A',
  Titan: 'Titano',
  Dragon: 'Drago',
  Electro: 'Elettro',
  Legend: 'Leggende',
};

/** `Electro League 32` -> `Lega Elettro 32`, `Legend League III` -> `Lega Leggende III`. */
export function leagueLabel(name: string): string {
  const match = /^(.+) League (\S+)$/.exec(name);
  const italian = match?.[1] ? LEAGUE_NAMES[match[1]] : undefined;
  if (!match || !italian) return name === 'Unranked' ? 'Senza lega' : name;
  return `Lega ${italian} ${match[2]}`;
}
