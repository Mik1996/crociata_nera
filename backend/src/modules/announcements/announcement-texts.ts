import { CommendationTier, CommendationType } from '@/modules/commendations/commendation-rules';
import type { RecordName } from './announcement-data';
import type { AnnouncementKind } from './announcement.model';

/**
 * Words of the announcements (captions and pictures) in the languages of the site: they follow the
 * language the administrator is looking at, and the post goes out in it. Names of the commendations
 * and records as in `public/i18n/*.json` (`commendations.<type>.<tier>`, `welcome.records.*`): keep
 * them in step.
 */

export const ANNOUNCEMENT_LANGUAGES = ['it-IT', 'en-US', 'es-ES'] as const;
export type AnnouncementLanguage = (typeof ANNOUNCEMENT_LANGUAGES)[number];
/** The language of the channel when none is given. */
export const DEFAULT_ANNOUNCEMENT_LANGUAGE: AnnouncementLanguage = 'it-IT';

type CommendationLabels = Readonly<Record<CommendationType, Partial<Record<CommendationTier, string>>>>;

/** Everything an announcement writes, in one language. */
export interface AnnouncementTexts {
  language: AnnouncementLanguage;
  commendations: CommendationLabels;
  tiers: Readonly<Record<CommendationTier, string>>;
  records: Readonly<Record<RecordName, string>>;
  /** `2026-11` -> `Novembre 2026`. */
  month(month: string): string;
  /** Thousands always grouped (also with four digits). */
  number(value: number, decimals?: number): string;
  /** Position in a ranking: `37°`, `#37`, `37.º`. */
  place(value: number): string;
  /** `Electro League 32` -> `Lega Elettro 32` (the API writes the names in English). */
  league(name: string): string;
  /** `n` of something, singular or plural. */
  count(n: number, one: string, many: string): string;
  /** `IT` -> `Italia` (name of a country in the language). */
  country(code: string): string;
  /** A day: `23 novembre 2026`. */
  day(iso: string): string;
  /** A Raid Weekend by the day it starts: `Weekend del 13 novembre 2026`. */
  weekend(iso: string): string;

  caption: {
    month: {
      title(clan: string, month: string): string;
      wars(total: number, victories: number, draws: number, defeats: number): string;
      stars(average: string, threeStarRate: string): string;
      raids(gold: string, weekends: number): string;
      best(name: string, average: string): string;
      footer: string;
    };
    cwl: {
      title(clan: string, month: string): string;
      rank(place: string, clans: number, stars: number): string;
      results(wins: number, draws: number, losses: number): string;
      best(count: number, names: string, stars: number, attacks: number): string;
      footer: string;
    };
    donations: {
      title(clan: string, month: string): string;
      total(troops: string): string;
      footer: string;
    };
    record: {
      title(clan: string): string;
      perfectWars(value: string): string;
      warWinStreak(value: number, previous: number | null): string;
      cwlLeague(league: string, previous: string | null): string;
      ranking(label: string, place: string, previous: string | null): string;
      capitalPoints(value: string, previous: string | null): string;
      footer: string;
    };
    promotion: {
      title(player: string, league: string): string;
      top: string;
      legend: string;
      electro: string;
      congratulations(clan: string): string;
    };
    legendSeason: {
      title(player: string, league: string): string;
      trophies(value: string): string;
      country(place: string, country: string): string;
      world(place: string): string;
      closing: string;
    };
    war: {
      /** First line, by result: `🏆 **Vittoria contro X!**`. */
      title(result: 'win' | 'lose' | 'tie', opponent: string): string;
      score(stars: number, opponentStars: number, destruction: string, opponentDestruction: string): string;
      attacks(used: number, total: number): string;
      best: string;
      /** A best attacker: stars and destruction. */
      attacker(name: string, stars: number, destruction: string): string;
      footer: string;
    };
    raid: {
      title(clan: string, weekend: string): string;
      gold(gold: string, attacks: string): string;
      districts(districts: number, raids: number): string;
      medals(medals: string): string;
      footer: string;
    };
    honours: string;
    andOthers(n: number): string;
    /** Label of the button that opens the page of the announcement on the site. */
    openSite: string;
    /** Hashtag of each kind of announcement (without `#`), to find them in the channel. */
    hashtags: Readonly<Record<AnnouncementKind, string>>;
  };

  image: {
    month: {
      subtitle: string;
      wars: string;
      warsNote(victories: number, draws: number, defeats: number): string;
      starsPerWar: string;
      starsNote(stars: string): string;
      destruction: string;
      threeStars: string;
      threeStarsNote(attacks: string): string;
      missed: string;
      missedSome: string;
      missedNone: string;
      capitalGold: string;
      capitalGoldNote(weekends: number, attacks: string): string;
      empty: string;
      best: string;
      bestNote(average: string, wars: number): string;
    };
    honours: { title: string; cwl(month: string): string; donations(month: string): string; raid(weekend: string): string };
    cwl: {
      title: string;
      place: string;
      placeNote(clans: number): string;
      stars: string;
      starsNote: string;
      wins: string;
      drawsAndLosses: string;
      best(count: number): string;
      bestNote(stars: number, attacks: number, many: boolean): string;
    };
    donations: { title: string; season(month: string): string; troops: string; troopsNote: string };
    record: {
      title: string;
      units: Readonly<Record<Exclude<RecordName, 'cwlLeague'>, string>>;
      previous(value: string): string;
      never: string;
      leagueBefore(league: string): string;
      leagueHighest: string;
    };
    promotion: { title: string; reaches(league: string): string; top: string; legend: string; electro: string };
    legendSeason: {
      title: string;
      ended(day: string): string;
      trophies: string;
      country(country: string): string;
      world: string;
      top: string;
    };
    war: {
      result: Readonly<Record<'win' | 'lose' | 'tie', string>>;
      /** Subtitle: `contro X · 15 contro 15`. */
      against(opponent: string, size: number): string;
      stars: string;
      destruction: string;
      attacks: string;
      attacksNote(missed: number): string;
      best: string;
      /** Row of a best attacker. */
      attacker(stars: number, destruction: string): string;
    };
    raid: {
      title: string;
      gold: string;
      goldNote(attacks: string): string;
      districts: string;
      districtsNote(raids: number): string;
      medals: string;
      medalsNote(offense: string, defense: string): string;
      participants: string;
      participantsNote: string;
      looters: string;
    };
  };
}

const SITE = 'crociatanera.it';

function months(locale: string) {
  const format = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (month: string) => {
    const label = format.format(new Date(`${month}-15T12:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
}

function numbers(locale: string) {
  const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: 'always' });
  return (value: number, decimals?: number) =>
    decimals === undefined
      ? plain.format(value)
      : new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: 'always' }).format(value);
}

/** League names: `<prefix> <family> <division>` from the English name of the API. */
function leagues(families: Readonly<Record<string, string>>, format: (family: string, division: string) => string, unranked: string) {
  return (name: string) => {
    const match = /^(.+) League (\S+)$/.exec(name);
    const family = match?.[1] ? families[match[1]] : undefined;
    if (!match?.[2] || !family) return name === 'Unranked' ? unranked : name;
    return format(family, match[2]);
  };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function countries(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return (code: string) => names.of(code.toUpperCase()) ?? code;
}

function days(locale: string) {
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
  return (iso: string) => format.format(new Date(iso));
}

const ITALIAN: AnnouncementTexts = {
  language: 'it-IT',
  commendations: {
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
  },
  tiers: { legendary: 'Leggendario', gold: 'Oro', silver: 'Argento', bronze: 'Bronzo' },
  records: {
    perfectWars: 'Guerre perfette',
    warWinStreak: 'Serie di vittorie in guerra',
    cwlLeague: 'Miglior lega CWL',
    localRank: 'Miglior posizione in Italia',
    localCapitalRank: 'Miglior posizione capitale in Italia',
    capitalPoints: 'Record trofei capitale',
  },
  month: months('it-IT'),
  number: numbers('it-IT'),
  place: (value) => `${numbers('it-IT')(value)}°`,
  league: leagues(
    {
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
    },
    (family, division) => `Lega ${family} ${division}`,
    'Senza lega',
  ),
  count,
  country: countries('it-IT'),
  day: days('it-IT'),
  weekend: (iso) => `Weekend del ${days('it-IT')(iso)}`,
  caption: {
    month: {
      title: (clan, month) => `⚔️ **${clan} · ${month}**`,
      wars: (total, v, d, l) => `🛡️ ${count(total, 'guerra', 'guerre')}: ${v} vinte, ${d} pari, ${l} perse`,
      stars: (average, rate) => `⭐ ${average} stelle a guerra · ${rate}% di tre stelle`,
      raids: (gold, weekends) => `🏰 ${gold} di oro della capitale in ${weekends} Raid Weekend`,
      best: (name, average) => `👑 Migliore del mese: **${name}** (${average} stelle a guerra)`,
      footer: `Tutte le statistiche su ${SITE}`,
    },
    cwl: {
      title: (clan, month) => `🏆 **${clan} · CWL di ${month}**`,
      rank: (place, clans, stars) => `📊 ${place} posto su ${clans} con ${stars} stelle`,
      results: (w, d, l) => `⚔️ ${count(w, 'vittoria', 'vittorie')}, ${d} pari, ${count(l, 'sconfitta', 'sconfitte')}`,
      best: (n, names, stars, attacks) =>
        `👑 ${n > 1 ? 'Migliori attaccanti' : 'Migliore attaccante'}: ${names} (${stars} stelle in ${attacks} attacchi)`,
      footer: `Tutta la lega su ${SITE}`,
    },
    donations: {
      title: (clan, month) => `🤝 **${clan} · donazioni di ${month}**`,
      total: (troops) => `📦 ${troops} truppe donate nella stagione`,
      footer: `Grazie a chi rinforza i compagni! Classifica completa su ${SITE}`,
    },
    record: {
      title: (clan) => `⚔️ **Nuovo record di ${clan}!** ⚔️`,
      perfectWars: (value) => `⭐ **${value} guerre perfette**: ogni stella presa, ogni volta.`,
      warWinStreak: (value, previous) => `⚔️ **${value} guerre vinte di fila**${previous ? ` (precedente: ${previous})` : ''}.`,
      cwlLeague: (league, previous) => `🏆 Siamo in **${league}**: la lega più alta mai raggiunta${previous ? ` (prima: ${previous})` : ''}.`,
      ranking: (label, place, previous) => `📈 ${label}: **${place} posto**${previous ? ` (precedente: ${previous})` : ''}.`,
      capitalPoints: (value, previous) => `🏰 **${value} trofei della capitale**${previous ? ` (precedente: ${previous})` : ''}.`,
      footer: `Tutti i record su ${SITE}`,
    },
    promotion: {
      title: (player, league) => `**${player}** sale in **${league}**!`,
      top: 'Tra i campioni del mondo: la lega più alta che esista.',
      legend: 'Tra le Leggende: un traguardo per pochi.',
      electro: 'Un altro gradino verso le Leggende.',
      congratulations: (clan) => `Complimenti da tutta la ${clan}! ⚔️`,
    },
    legendSeason: {
      title: (player, league) => `**${player}** chiude la stagione in **${league}**!`,
      trophies: (value) => `🏆 **${value}** trofei`,
      country: (place, country) => `**${place}** in ${country}`,
      world: (place) => `🌍 **${place}** nel mondo`,
      closing: 'Tra i migliori 10.000 giocatori del pianeta. Complimenti da tutti i clan della Crociata! ⚔️',
    },
    war: {
      title: (result, opponent) =>
        result === 'win' ? `🏆 **Vittoria contro ${opponent}!**` : result === 'tie' ? `🤝 **Pareggio contro ${opponent}**` : `⚔️ **Sconfitta contro ${opponent}**`,
      score: (stars, other, d, od) => `⭐ ${stars} stelle a ${other} · ${d}% a ${od}%`,
      attacks: (used, total) => `🎯 Attacchi: ${used} su ${total}`,
      best: 'Migliori in attacco',
      attacker: (name, stars, d) => `**${name}** ${stars}⭐ ${d}%`,
      footer: `Tutta la guerra su ${SITE}`,
    },
    raid: {
      title: (clan, weekend) => `🏰 **${clan} · Raid Weekend**\n${weekend}`,
      gold: (gold, attacks) => `💰 ${gold} di oro della capitale in ${attacks} attacchi`,
      districts: (districts, raids) => `🗺️ ${count(districts, 'distretto distrutto', 'distretti distrutti')} · ${count(raids, 'capitale conquistata', 'capitali conquistate')}`,
      medals: (medals) => `🏅 ${medals} medaglie raid a testa`,
      footer: `Tutti i dettagli su ${SITE}`,
    },
    honours: 'Encomi',
    andOthers: (n) => ` e altri ${n}`,
    openSite: '🌐 Apri sul sito',
    hashtags: {
      month: 'Resoconto',
      cwl: 'CWL',
      donations: 'Donazioni',
      record: 'Record',
      promotion: 'Promozione',
      legendSeason: 'Leggende',
      war: 'Guerra',
      raid: 'RaidWeekend',
    },
  },
  image: {
    month: {
      subtitle: 'Il mese della Crociata',
      wars: 'Guerre',
      warsNote: (v, d, l) => `${v} vinte · ${d} pari · ${l} perse`,
      starsPerWar: 'Stelle a guerra',
      starsNote: (stars) => `${stars} stelle in tutto`,
      destruction: 'Distruzione media',
      threeStars: 'Attacchi a tre stelle',
      threeStarsNote: (attacks) => `su ${attacks} attacchi`,
      missed: 'Attacchi mancati',
      missedSome: 'ogni attacco conta',
      missedNone: 'nessuno: tutti presenti!',
      capitalGold: 'Oro della capitale',
      capitalGoldNote: (weekends, attacks) => `${weekends} Raid Weekend · ${attacks} attacchi`,
      empty: 'Nessuna guerra né Raid Weekend questo mese',
      best: 'Migliore del mese',
      bestNote: (average, wars) => `${average} stelle a guerra in ${count(wars, 'guerra', 'guerre')}`,
    },
    honours: { title: "Albo d'onore", cwl: (month) => `CWL di ${month}`, donations: (month) => `Donazioni di ${month}`, raid: (weekend) => weekend },
    cwl: {
      title: 'Lega fra Clan',
      place: 'Posizione',
      placeNote: (clans) => `su ${clans} clan`,
      stars: 'Stelle',
      starsNote: 'con i bonus delle vittorie',
      wins: 'Vittorie',
      drawsAndLosses: 'Pareggi e sconfitte',
      best: (n) => (n > 1 ? 'Migliori attaccanti' : 'Migliore attaccante'),
      bestNote: (stars, attacks, many) => `${stars} stelle in ${attacks} attacchi${many ? ' ciascuno' : ''}`,
    },
    donations: {
      title: 'Donazioni',
      season: (month) => `Stagione di ${month}`,
      troops: 'Truppe donate',
      troopsNote: 'in tutta la stagione',
    },
    record: {
      title: 'Nuovo record',
      units: {
        perfectWars: 'guerre vinte con tutte le stelle',
        warWinStreak: 'guerre vinte di fila',
        localRank: 'posto nella classifica dei clan in Italia',
        localCapitalRank: 'posto nella classifica della capitale in Italia',
        capitalPoints: 'trofei della capitale',
      },
      previous: (value) => `Il record precedente: ${value}`,
      never: 'Mai così in alto',
      leagueBefore: (league) => `Prima: ${league}`,
      leagueHighest: 'La lega più alta mai raggiunta',
    },
    promotion: {
      title: 'Promozione!',
      reaches: (league) => `sale in ${league}`,
      top: 'Tra i campioni del mondo',
      legend: 'Tra le Leggende',
      electro: 'Nuova lega raggiunta',
    },
    legendSeason: {
      title: 'Stagione Leggenda',
      ended: (day) => `Conclusa il ${day}`,
      trophies: 'trofei',
      country: (country) => `in ${country}`,
      world: 'nel mondo',
      top: 'Tra i migliori 10.000 del mondo',
    },
    war: {
      result: { win: 'Vittoria!', lose: 'Sconfitta', tie: 'Pareggio' },
      against: (opponent, size) => `contro ${opponent} · ${size} contro ${size}`,
      stars: 'stelle',
      destruction: 'distruzione',
      attacks: 'Attacchi',
      attacksNote: (missed) => (missed ? `${count(missed, 'attacco mancato', 'attacchi mancati')}` : 'tutti usati'),
      best: 'Migliori in attacco',
      attacker: (stars, d) => `${stars} stelle · ${d}%`,
    },
    raid: {
      title: 'Raid Weekend',
      gold: 'Oro della capitale',
      goldNote: (attacks) => `in ${attacks} attacchi`,
      districts: 'Distretti distrutti',
      districtsNote: (raids) => count(raids, 'capitale conquistata', 'capitali conquistate'),
      medals: 'Medaglie raid',
      medalsNote: (offense, defense) => `a testa · attacco ${offense} · difesa ${defense}`,
      participants: 'Partecipanti',
      participantsNote: 'membri che hanno attaccato',
      looters: 'Migliori razziatori',
    },
  },
};

const ENGLISH: AnnouncementTexts = {
  language: 'en-US',
  commendations: {
    cwlAllAttacks: { legendary: 'League Certainty' },
    champion: { bronze: 'Valiant', silver: 'Commander', gold: 'Warlord' },
    perfect: { bronze: 'Steady Hand', silver: 'Relentless Sword', gold: 'Unerring Blade' },
    giantSlayer: { bronze: 'Daring', silver: 'Giant Hunter', gold: 'Bane of Titans' },
    cwlStriker: { bronze: 'League Warrior', silver: 'League Champion', gold: 'League Legend' },
    capitalRaider: { bronze: 'Raider', silver: 'Capital Predator', gold: 'Conqueror of Capitals' },
    donor: { bronze: 'Bearer of Reinforcements', silver: 'Lord of Legions', gold: 'Father of Armies' },
    wall: { bronze: 'Steady Shield', silver: 'Steel Bastion', gold: 'Impassable Wall' },
    tireless: { bronze: 'Loyal Soldier', silver: 'Tireless Veteran', gold: 'Indomitable Arm' },
    present: { bronze: 'At Roll Call', silver: 'Pillar of the Clan', gold: 'Always on the Front Line' },
  },
  tiers: { legendary: 'Legendary', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' },
  records: {
    perfectWars: 'Perfect wars',
    warWinStreak: 'War win streak',
    cwlLeague: 'Best CWL league',
    localRank: 'Best rank in Italy',
    localCapitalRank: 'Best capital rank in Italy',
    capitalPoints: 'Most capital trophies',
  },
  month: months('en-US'),
  number: numbers('en-US'),
  place: (value) => `#${numbers('en-US')(value)}`,
  league: leagues(
    {
      Skeleton: 'Skeleton',
      Barbarian: 'Barbarian',
      Archer: 'Archer',
      Wizard: 'Wizard',
      Valkyrie: 'Valkyrie',
      Witch: 'Witch',
      Golem: 'Golem',
      'P.E.K.K.A': 'P.E.K.K.A',
      Titan: 'Titan',
      Dragon: 'Dragon',
      Electro: 'Electro',
      Legend: 'Legend',
    },
    (family, division) => `${family} League ${division}`,
    'Unranked',
  ),
  count,
  country: countries('en-US'),
  day: days('en-US'),
  weekend: (iso) => `Weekend of ${days('en-US')(iso)}`,
  caption: {
    month: {
      title: (clan, month) => `⚔️ **${clan} · ${month}**`,
      wars: (total, v, d, l) => `🛡️ ${count(total, 'war', 'wars')}: ${v} won, ${d} drawn, ${l} lost`,
      stars: (average, rate) => `⭐ ${average} stars per war · ${rate}% three-star attacks`,
      raids: (gold, weekends) => `🏰 ${gold} Capital Gold in ${weekends} Raid Weekend${weekends === 1 ? '' : 's'}`,
      best: (name, average) => `👑 Best of the month: **${name}** (${average} stars per war)`,
      footer: `All the statistics on ${SITE}`,
    },
    cwl: {
      title: (clan, month) => `🏆 **${clan} · ${month} CWL**`,
      rank: (place, clans, stars) => `📊 ${place} of ${clans} with ${stars} stars`,
      results: (w, d, l) => `⚔️ ${count(w, 'win', 'wins')}, ${count(d, 'draw', 'draws')}, ${count(l, 'loss', 'losses')}`,
      best: (n, names, stars, attacks) => `👑 ${n > 1 ? 'Best attackers' : 'Best attacker'}: ${names} (${stars} stars in ${attacks} attacks)`,
      footer: `The whole league on ${SITE}`,
    },
    donations: {
      title: (clan, month) => `🤝 **${clan} · ${month} donations**`,
      total: (troops) => `📦 ${troops} troops donated in the season`,
      footer: `Thanks to everyone who reinforces their clanmates! Full ranking on ${SITE}`,
    },
    record: {
      title: (clan) => `⚔️ **New ${clan} record!** ⚔️`,
      perfectWars: (value) => `⭐ **${value} perfect wars**: every star taken, every time.`,
      warWinStreak: (value, previous) => `⚔️ **${value} wars won in a row**${previous ? ` (previous: ${previous})` : ''}.`,
      cwlLeague: (league, previous) => `🏆 We are in **${league}**: the highest league we ever reached${previous ? ` (before: ${previous})` : ''}.`,
      ranking: (label, place, previous) => `📈 ${label}: **${place}**${previous ? ` (previous: ${previous})` : ''}.`,
      capitalPoints: (value, previous) => `🏰 **${value} capital trophies**${previous ? ` (previous: ${previous})` : ''}.`,
      footer: `All the records on ${SITE}`,
    },
    promotion: {
      title: (player, league) => `**${player}** reaches **${league}**!`,
      top: "Among the world's champions: the highest league there is.",
      legend: 'Among the Legends: a goal for the few.',
      electro: 'One more step towards the Legends.',
      congratulations: (clan) => `Congratulations from all of ${clan}! ⚔️`,
    },
    legendSeason: {
      title: (player, league) => `**${player}** ends the season in **${league}**!`,
      trophies: (value) => `🏆 **${value}** trophies`,
      country: (place, country) => `**${place}** in ${country}`,
      world: (place) => `🌍 **${place}** in the world`,
      closing: 'Among the best 10,000 players on the planet. Congratulations from all the clans of the Crusade! ⚔️',
    },
    war: {
      title: (result, opponent) =>
        result === 'win' ? `🏆 **Victory against ${opponent}!**` : result === 'tie' ? `🤝 **Draw against ${opponent}**` : `⚔️ **Defeat against ${opponent}**`,
      score: (stars, other, d, od) => `⭐ ${stars} stars to ${other} · ${d}% to ${od}%`,
      attacks: (used, total) => `🎯 Attacks: ${used} of ${total}`,
      best: 'Best attackers',
      attacker: (name, stars, d) => `**${name}** ${stars}⭐ ${d}%`,
      footer: `The whole war on ${SITE}`,
    },
    raid: {
      title: (clan, weekend) => `🏰 **${clan} · Raid Weekend**\n${weekend}`,
      gold: (gold, attacks) => `💰 ${gold} Capital Gold in ${attacks} attacks`,
      districts: (districts, raids) => `🗺️ ${count(districts, 'district destroyed', 'districts destroyed')} · ${count(raids, 'capital conquered', 'capitals conquered')}`,
      medals: (medals) => `🏅 ${medals} raid medals each`,
      footer: `All the details on ${SITE}`,
    },
    honours: 'Commendations',
    andOthers: (n) => ` and ${n} more`,
    openSite: '🌐 Open on the site',
    hashtags: {
      month: 'Recap',
      cwl: 'CWL',
      donations: 'Donations',
      record: 'Record',
      promotion: 'Promotion',
      legendSeason: 'Legends',
      war: 'War',
      raid: 'RaidWeekend',
    },
  },
  image: {
    month: {
      subtitle: 'The month of the Crusade',
      wars: 'Wars',
      warsNote: (v, d, l) => `${v} won · ${d} drawn · ${l} lost`,
      starsPerWar: 'Stars per war',
      starsNote: (stars) => `${stars} stars in all`,
      destruction: 'Average destruction',
      threeStars: 'Three-star attacks',
      threeStarsNote: (attacks) => `of ${attacks} attacks`,
      missed: 'Missed attacks',
      missedSome: 'every attack counts',
      missedNone: 'none: everyone showed up!',
      capitalGold: 'Capital Gold',
      capitalGoldNote: (weekends, attacks) => `${weekends} Raid Weekend${weekends === 1 ? '' : 's'} · ${attacks} attacks`,
      empty: 'No wars and no Raid Weekends this month',
      best: 'Best of the month',
      bestNote: (average, wars) => `${average} stars per war in ${count(wars, 'war', 'wars')}`,
    },
    honours: { title: 'Roll of honour', cwl: (month) => `${month} CWL`, donations: (month) => `${month} donations`, raid: (weekend) => weekend },
    cwl: {
      title: 'Clan War League',
      place: 'Place',
      placeNote: (clans) => `of ${clans} clans`,
      stars: 'Stars',
      starsNote: 'with the bonus of the wins',
      wins: 'Wins',
      drawsAndLosses: 'Draws and losses',
      best: (n) => (n > 1 ? 'Best attackers' : 'Best attacker'),
      bestNote: (stars, attacks, many) => `${stars} stars in ${attacks} attacks${many ? ' each' : ''}`,
    },
    donations: {
      title: 'Donations',
      season: (month) => `${month} season`,
      troops: 'Troops donated',
      troopsNote: 'in the whole season',
    },
    record: {
      title: 'New record',
      units: {
        perfectWars: 'wars won with every star',
        warWinStreak: 'wars won in a row',
        localRank: 'place in the clan ranking of Italy',
        localCapitalRank: 'place in the capital ranking of Italy',
        capitalPoints: 'capital trophies',
      },
      previous: (value) => `Previous record: ${value}`,
      never: 'Never this high',
      leagueBefore: (league) => `Before: ${league}`,
      leagueHighest: 'The highest league ever reached',
    },
    promotion: {
      title: 'Promotion!',
      reaches: (league) => `reaches ${league}`,
      top: "Among the world's champions",
      legend: 'Among the Legends',
      electro: 'New league reached',
    },
    legendSeason: {
      title: 'Legend Season',
      ended: (day) => `Ended on ${day}`,
      trophies: 'trophies',
      country: (country) => `in ${country}`,
      world: 'in the world',
      top: 'Among the best 10,000 in the world',
    },
    war: {
      result: { win: 'Victory!', lose: 'Defeat', tie: 'Draw' },
      against: (opponent, size) => `against ${opponent} · ${size} vs ${size}`,
      stars: 'stars',
      destruction: 'destruction',
      attacks: 'Attacks',
      attacksNote: (missed) => (missed ? count(missed, 'attack missed', 'attacks missed') : 'all used'),
      best: 'Best attackers',
      attacker: (stars, d) => `${stars} stars · ${d}%`,
    },
    raid: {
      title: 'Raid Weekend',
      gold: 'Capital Gold',
      goldNote: (attacks) => `in ${attacks} attacks`,
      districts: 'Districts destroyed',
      districtsNote: (raids) => count(raids, 'capital conquered', 'capitals conquered'),
      medals: 'Raid medals',
      medalsNote: (offense, defense) => `each · attack ${offense} · defense ${defense}`,
      participants: 'Participants',
      participantsNote: 'members who attacked',
      looters: 'Top raiders',
    },
  },
};

const SPANISH: AnnouncementTexts = {
  language: 'es-ES',
  commendations: {
    cwlAllAttacks: { legendary: 'Certeza de Liga' },
    champion: { bronze: 'Valeroso', silver: 'Caudillo', gold: 'Señor de la Guerra' },
    perfect: { bronze: 'Mano Firme', silver: 'Espada Implacable', gold: 'Hoja Infalible' },
    giantSlayer: { bronze: 'Temerario', silver: 'Cazador de Gigantes', gold: 'Azote de Titanes' },
    cwlStriker: { bronze: 'Guerrero de Liga', silver: 'Campeón de Liga', gold: 'Leyenda de la Liga' },
    capitalRaider: { bronze: 'Saqueador', silver: 'Depredador de la Capital', gold: 'Conquistador de Capitales' },
    donor: { bronze: 'Portador de Refuerzos', silver: 'Señor de las Legiones', gold: 'Padre de los Ejércitos' },
    wall: { bronze: 'Escudo Firme', silver: 'Bastión de Acero', gold: 'Muro Infranqueable' },
    tireless: { bronze: 'Soldado Fiel', silver: 'Veterano Incansable', gold: 'Brazo Indómito' },
    present: { bronze: 'Presente en la Llamada', silver: 'Pilar del Clan', gold: 'Siempre en Primera Línea' },
  },
  tiers: { legendary: 'Legendario', gold: 'Oro', silver: 'Plata', bronze: 'Bronce' },
  records: {
    perfectWars: 'Guerras perfectas',
    warWinStreak: 'Racha de victorias en guerra',
    cwlLeague: 'Mejor liga de la CWL',
    localRank: 'Mejor puesto en Italia',
    localCapitalRank: 'Mejor puesto de capital en Italia',
    capitalPoints: 'Récord de trofeos de capital',
  },
  month: months('es-ES'),
  number: numbers('es-ES'),
  place: (value) => `${numbers('es-ES')(value)}.º`,
  league: leagues(
    {
      Skeleton: 'Esqueleto',
      Barbarian: 'Bárbaro',
      Archer: 'Arquera',
      Wizard: 'Mago',
      Valkyrie: 'Valquiria',
      Witch: 'Bruja',
      Golem: 'Gólem',
      'P.E.K.K.A': 'P.E.K.K.A',
      Titan: 'Titán',
      Dragon: 'Dragón',
      Electro: 'Electro',
      Legend: 'Leyenda',
    },
    (family, division) => `Liga ${family} ${division}`,
    'Sin liga',
  ),
  count,
  country: countries('es-ES'),
  day: days('es-ES'),
  weekend: (iso) => `Fin de semana del ${days('es-ES')(iso)}`,
  caption: {
    month: {
      title: (clan, month) => `⚔️ **${clan} · ${month}**`,
      wars: (total, v, d, l) => `🛡️ ${count(total, 'guerra', 'guerras')}: ${v} ganadas, ${d} empatadas, ${l} perdidas`,
      stars: (average, rate) => `⭐ ${average} estrellas por guerra · ${rate}% de tres estrellas`,
      raids: (gold, weekends) => `🏰 ${gold} de oro de la capital en ${weekends} Raid Weekend`,
      best: (name, average) => `👑 Mejor del mes: **${name}** (${average} estrellas por guerra)`,
      footer: `Todas las estadísticas en ${SITE}`,
    },
    cwl: {
      title: (clan, month) => `🏆 **${clan} · CWL de ${month}**`,
      rank: (place, clans, stars) => `📊 ${place} puesto de ${clans} con ${stars} estrellas`,
      results: (w, d, l) => `⚔️ ${count(w, 'victoria', 'victorias')}, ${count(d, 'empate', 'empates')}, ${count(l, 'derrota', 'derrotas')}`,
      best: (n, names, stars, attacks) =>
        `👑 ${n > 1 ? 'Mejores atacantes' : 'Mejor atacante'}: ${names} (${stars} estrellas en ${attacks} ataques)`,
      footer: `Toda la liga en ${SITE}`,
    },
    donations: {
      title: (clan, month) => `🤝 **${clan} · donaciones de ${month}**`,
      total: (troops) => `📦 ${troops} tropas donadas en la temporada`,
      footer: `¡Gracias a quienes refuerzan a sus compañeros! Clasificación completa en ${SITE}`,
    },
    record: {
      title: (clan) => `⚔️ **¡Nuevo récord de ${clan}!** ⚔️`,
      perfectWars: (value) => `⭐ **${value} guerras perfectas**: todas las estrellas, cada vez.`,
      warWinStreak: (value, previous) => `⚔️ **${value} guerras ganadas seguidas**${previous ? ` (anterior: ${previous})` : ''}.`,
      cwlLeague: (league, previous) => `🏆 Estamos en **${league}**: la liga más alta jamás alcanzada${previous ? ` (antes: ${previous})` : ''}.`,
      ranking: (label, place, previous) => `📈 ${label}: **${place} puesto**${previous ? ` (anterior: ${previous})` : ''}.`,
      capitalPoints: (value, previous) => `🏰 **${value} trofeos de capital**${previous ? ` (anterior: ${previous})` : ''}.`,
      footer: `Todos los récords en ${SITE}`,
    },
    promotion: {
      title: (player, league) => `¡**${player}** sube a **${league}**!`,
      top: 'Entre los campeones del mundo: la liga más alta que existe.',
      legend: 'Entre las Leyendas: una meta para pocos.',
      electro: 'Un peldaño más hacia las Leyendas.',
      congratulations: (clan) => `¡Enhorabuena de parte de toda la ${clan}! ⚔️`,
    },
    legendSeason: {
      title: (player, league) => `¡**${player}** cierra la temporada en **${league}**!`,
      trophies: (value) => `🏆 **${value}** trofeos`,
      country: (place, country) => `**${place}** en ${country}`,
      world: (place) => `🌍 **${place}** en el mundo`,
      closing: 'Entre los 10.000 mejores jugadores del planeta. ¡Enhorabuena de parte de todos los clanes de la Cruzada! ⚔️',
    },
    war: {
      title: (result, opponent) =>
        result === 'win' ? `🏆 **¡Victoria contra ${opponent}!**` : result === 'tie' ? `🤝 **Empate contra ${opponent}**` : `⚔️ **Derrota contra ${opponent}**`,
      score: (stars, other, d, od) => `⭐ ${stars} estrellas a ${other} · ${d}% a ${od}%`,
      attacks: (used, total) => `🎯 Ataques: ${used} de ${total}`,
      best: 'Mejores atacantes',
      attacker: (name, stars, d) => `**${name}** ${stars}⭐ ${d}%`,
      footer: `Toda la guerra en ${SITE}`,
    },
    raid: {
      title: (clan, weekend) => `🏰 **${clan} · Raid Weekend**\n${weekend}`,
      gold: (gold, attacks) => `💰 ${gold} de oro de la capital en ${attacks} ataques`,
      districts: (districts, raids) => `🗺️ ${count(districts, 'distrito destruido', 'distritos destruidos')} · ${count(raids, 'capital conquistada', 'capitales conquistadas')}`,
      medals: (medals) => `🏅 ${medals} medallas de incursión cada uno`,
      footer: `Todos los detalles en ${SITE}`,
    },
    honours: 'Encomios',
    andOthers: (n) => ` y ${n} más`,
    openSite: '🌐 Abrir en el sitio',
    hashtags: {
      month: 'Resumen',
      cwl: 'CWL',
      donations: 'Donaciones',
      record: 'Récord',
      promotion: 'Ascenso',
      legendSeason: 'Leyendas',
      war: 'Guerra',
      raid: 'RaidWeekend',
    },
  },
  image: {
    month: {
      subtitle: 'El mes de la Cruzada',
      wars: 'Guerras',
      warsNote: (v, d, l) => `${v} ganadas · ${d} empatadas · ${l} perdidas`,
      starsPerWar: 'Estrellas por guerra',
      starsNote: (stars) => `${stars} estrellas en total`,
      destruction: 'Destrucción media',
      threeStars: 'Ataques de tres estrellas',
      threeStarsNote: (attacks) => `de ${attacks} ataques`,
      missed: 'Ataques perdidos',
      missedSome: 'cada ataque cuenta',
      missedNone: 'ninguno: ¡todos presentes!',
      capitalGold: 'Oro de la capital',
      capitalGoldNote: (weekends, attacks) => `${weekends} Raid Weekend · ${attacks} ataques`,
      empty: 'Ninguna guerra ni Raid Weekend este mes',
      best: 'Mejor del mes',
      bestNote: (average, wars) => `${average} estrellas por guerra en ${count(wars, 'guerra', 'guerras')}`,
    },
    honours: { title: 'Cuadro de honor', cwl: (month) => `CWL de ${month}`, donations: (month) => `Donaciones de ${month}`, raid: (weekend) => weekend },
    cwl: {
      title: 'Liga de Clanes',
      place: 'Puesto',
      placeNote: (clans) => `de ${clans} clanes`,
      stars: 'Estrellas',
      starsNote: 'con el bonus de las victorias',
      wins: 'Victorias',
      drawsAndLosses: 'Empates y derrotas',
      best: (n) => (n > 1 ? 'Mejores atacantes' : 'Mejor atacante'),
      bestNote: (stars, attacks, many) => `${stars} estrellas en ${attacks} ataques${many ? ' cada uno' : ''}`,
    },
    donations: {
      title: 'Donaciones',
      season: (month) => `Temporada de ${month}`,
      troops: 'Tropas donadas',
      troopsNote: 'en toda la temporada',
    },
    record: {
      title: 'Nuevo récord',
      units: {
        perfectWars: 'guerras ganadas con todas las estrellas',
        warWinStreak: 'guerras ganadas seguidas',
        localRank: 'puesto en la clasificación de clanes de Italia',
        localCapitalRank: 'puesto en la clasificación de capital de Italia',
        capitalPoints: 'trofeos de capital',
      },
      previous: (value) => `Récord anterior: ${value}`,
      never: 'Nunca tan alto',
      leagueBefore: (league) => `Antes: ${league}`,
      leagueHighest: 'La liga más alta jamás alcanzada',
    },
    promotion: {
      title: '¡Ascenso!',
      reaches: (league) => `sube a ${league}`,
      top: 'Entre los campeones del mundo',
      legend: 'Entre las Leyendas',
      electro: 'Nueva liga alcanzada',
    },
    legendSeason: {
      title: 'Temporada Leyenda',
      ended: (day) => `Terminada el ${day}`,
      trophies: 'trofeos',
      country: (country) => `en ${country}`,
      world: 'en el mundo',
      top: 'Entre los 10.000 mejores del mundo',
    },
    war: {
      result: { win: '¡Victoria!', lose: 'Derrota', tie: 'Empate' },
      against: (opponent, size) => `contra ${opponent} · ${size} contra ${size}`,
      stars: 'estrellas',
      destruction: 'destrucción',
      attacks: 'Ataques',
      attacksNote: (missed) => (missed ? count(missed, 'ataque perdido', 'ataques perdidos') : 'todos usados'),
      best: 'Mejores atacantes',
      attacker: (stars, d) => `${stars} estrellas · ${d}%`,
    },
    raid: {
      title: 'Raid Weekend',
      gold: 'Oro de la capital',
      goldNote: (attacks) => `en ${attacks} ataques`,
      districts: 'Distritos destruidos',
      districtsNote: (raids) => count(raids, 'capital conquistada', 'capitales conquistadas'),
      medals: 'Medallas de incursión',
      medalsNote: (offense, defense) => `cada uno · ataque ${offense} · defensa ${defense}`,
      participants: 'Participantes',
      participantsNote: 'miembros que atacaron',
      looters: 'Mejores saqueadores',
    },
  },
};

const TEXTS: Readonly<Record<AnnouncementLanguage, AnnouncementTexts>> = {
  'it-IT': ITALIAN,
  'en-US': ENGLISH,
  'es-ES': SPANISH,
};

/** The words of a language (Italian, the channel's, when none is given). */
export function announcementTexts(language: AnnouncementLanguage = DEFAULT_ANNOUNCEMENT_LANGUAGE): AnnouncementTexts {
  return TEXTS[language];
}
