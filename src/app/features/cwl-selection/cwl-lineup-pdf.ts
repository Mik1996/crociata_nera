import { CwlSelection, CwlSelectionPlayer } from '../../core/backend/backend-api.types';
import { leagueTierImage, townHallImage } from '../../core/game/units';
import { formatLocalNumber } from '../../core/i18n/locale-pipes';
import { PdfFact, TablePdf } from '../../shared/pdf/table-pdf';

/** What the PDF of the line-up needs from the page: translations and names. */
export interface CwlLineupPdfContext {
  t(key: string, params?: Record<string, unknown>): string;
  locale: string;
  clanName(tag: string): string;
  /** Translation key of the role of a player, `null` when unknown. */
  roleKey(role: string | null): string | null;
  /** Last CWL season as a month (`Ottobre 2026`), `null` when none. */
  cwlSeason: string | null;
}

/** The rules of the ranking, in the order of the page (`cwlSelection.rules.*`). */
const RULES = [
  'eligibility',
  'cwl',
  'war',
  'noCwl',
  'heroes',
  'townHall',
  'league',
  'penalties',
  'exclusions',
  'order',
] as const;

/** Side of the town hall and league pictures in the table, in points. */
const PICTURE_SIZE = 20;

/** Month of the CWL the line-up is for: the season of the selection. */
export function lineupMonth(selection: CwlSelection): Date {
  const [year, month] = selection.season.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** `selezioni-cwl-crociata-nera-dicembre`: the month of the CWL, in Italian like the name. */
export function lineupFileName(selection: CwlSelection): string {
  const month = new Intl.DateTimeFormat('it-IT', { month: 'long', timeZone: 'UTC' })
    .format(lineupMonth(selection))
    .toLowerCase();
  return `selezioni-cwl-crociata-nera-${month}`;
}

/**
 * The CWL line-up as a PDF: the starters (15, or 30 picked by hand) first and the reserves on a page
 * of their own (none: no page) (numbered in
 * line-up order, with league and town hall pictures, clan, score, wars and heroes), the rules of
 * the ranking on page 3, each page with its own title. Excluded, bench and ineligible players are left out.
 */
export function cwlLineupPdf(
  selection: CwlSelection,
  ctx: CwlLineupPdfContext,
): TablePdf<CwlSelectionPlayer> {
  const starters = selection.players.filter((p) => p.status === 'starter');
  const reserves = selection.players.filter((p) => p.status === 'reserve');
  const position = new Map([...starters, ...reserves].map((p, i) => [p.tag, i + 1]));
  const number = (value: number, digits: string) => formatLocalNumber(value, ctx.locale, digits);

  const facts: PdfFact[] = [
    {
      label: ctx.t('cwlSelection.facts.townHall'),
      value:
        selection.maxTownHall === null
          ? '—'
          : ctx.t('cwlSelection.facts.townHallRange', {
              min: selection.minEligibleTownHall,
              max: selection.maxTownHall,
            }),
    },
    {
      label: ctx.t('cwlSelection.facts.lastCwl'),
      value: ctx.cwlSeason ?? ctx.t('cwlSelection.facts.noSeasons'),
    },
    {
      label: ctx.t('cwlSelection.facts.wars'),
      value: ctx.t('cwlSelection.facts.warsValue', {
        days: selection.warWindow.days,
        n: selection.warWindow.wars,
      }),
    },
    {
      label: ctx.t('cwlSelection.pdf.lineup'),
      value: ctx.t('cwlSelection.pdf.lineupValue', {
        starters: starters.length,
        reserves: reserves.length,
      }),
    },
  ];

  return {
    fileName: lineupFileName(selection),
    title: ctx.t('cwlSelection.pdf.title'),
    subtitle: ctx.t(
      selection.reserves ? 'cwlSelection.pdf.subtitle' : 'cwlSelection.pdf.subtitleNoReserves',
      { starters: selection.starters, reserves: selection.reserves },
    ),
    facts,
    columns: [
      { header: '#', width: 18, align: 'right', cell: (p) => position.get(p.tag) ?? '' },
      {
        header: ctx.t('cwlSelection.pdf.league'),
        width: 'auto',
        align: 'center',
        cell: (p) => ({ image: leagueTierImage(p.league?.id), size: PICTURE_SIZE, fallback: '—' }),
      },
      {
        header: ctx.t('common.th'),
        width: 28,
        align: 'center',
        cell: (p) => ({
          image: p.townHallLevel === null ? null : (townHallImage(p.townHallLevel) ?? null),
          size: PICTURE_SIZE,
          fallback: p.townHallLevel === null ? '—' : String(p.townHallLevel),
        }),
      },
      {
        header: ctx.t('common.player'),
        cell: (p) => {
          const role = ctx.roleKey(p.role);
          const clan = ctx.clanName(p.clanTag);
          return {
            text: p.name,
            emphasis: 'strong',
            note: role ? `${clan} · ${ctx.t(role)}` : clan,
          };
        },
      },
      {
        header: ctx.t('cwlSelection.score'),
        width: 'auto',
        align: 'right',
        cell: (p) => ({ text: number(p.score, '1.1-1'), emphasis: 'strong' }),
      },
      {
        header: ctx.t('cwlSelection.pdf.cwl'),
        width: 'auto',
        align: 'right',
        cell: (p) =>
          p.cwl
            ? {
                text: number(p.cwl.averageStarsPerAttack, '1.2-2'),
                note: ctx.t('cwlSelection.pdf.cwlAttacks', {
                  attacks: p.cwl.attacks,
                  wars: p.cwl.wars,
                }),
              }
            : { text: ctx.t('cwlSelection.noCwl'), emphasis: 'muted' },
      },
      {
        header: ctx.t('cwlSelection.pdf.war'),
        width: 'auto',
        align: 'right',
        cell: (p) =>
          p.war.wars
            ? {
                text: number(p.war.averageStarsPerAttack, '1.2-2'),
                note: ctx.t('cwlSelection.attacks', {
                  used: p.war.attacksUsed,
                  available: p.war.attacksAvailable,
                }),
              }
            : { text: ctx.t('cwlSelection.noWars'), emphasis: 'muted' },
      },
      {
        header: ctx.t('cwlSelection.heroes'),
        width: 'auto',
        align: 'right',
        cell: (p) =>
          p.heroes
            ? {
                text: `${number(p.heroes.levels, '1.0-0')}%`,
                note: ctx.t('cwlSelection.equipment', { n: number(p.heroes.equipment, '1.0-0') }),
              }
            : { text: ctx.t('cwlSelection.noHeroes'), emphasis: 'muted' },
      },
    ],
    groups: [
      {
        title: ctx.t('cwlSelection.legend.starter', {
          n: starters.length,
          max: selection.starters,
        }),
        accent: 'starter',
        rows: starters,
        pageTitle: ctx.t('cwlSelection.pdf.startersTitle'),
      },
      // A line-up picked by hand may have no reserves: no page for them.
      ...(reserves.length
        ? [
            {
              title: ctx.t('cwlSelection.legend.reserve', {
                n: reserves.length,
                max: selection.reserves,
              }),
              accent: 'reserve' as const,
              rows: reserves,
              pageBreakBefore: true,
              pageTitle: ctx.t('cwlSelection.pdf.reservesTitle'),
            },
          ]
        : []),
    ],
    emptyText: ctx.t('cwlSelection.empty'),
    notes: {
      title: ctx.t('cwlSelection.rules.title'),
      items: RULES.map((rule) =>
        ctx.t(`cwlSelection.rules.${rule}`, {
          starters: selection.starters,
          reserves: selection.reserves,
        }),
      ),
      pageBreakBefore: true,
      pageTitle: ctx.t('cwlSelection.pdf.rankingTitle'),
    },
  };
}
