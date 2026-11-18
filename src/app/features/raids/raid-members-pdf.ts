import { formatLocalNumber } from '../../core/i18n/locale-pipes';
import { RaidMember, RaidSeason } from '../../core/models';
import { TablePdf } from '../../shared/pdf/table-pdf';

/** What the PDF of a Raid Weekend needs from the page: translations and the weekend's dates. */
export interface RaidMembersPdfContext {
  t(key: string, params?: Record<string, unknown>): string;
  locale: string;
  /** The dates of the weekend, e.g. `6 – 9 nov 2026`. */
  weekendLabel: string;
}

/**
 * The members who attacked in a Raid Weekend as a PDF table: position, attacks (missing ones in red
 * once the weekend is over) and Capital Gold looted, with the totals; the weekend's figures above.
 */
export function raidMembersPdf(
  weekend: RaidSeason,
  ctx: RaidMembersPdfContext,
): TablePdf<RaidMember> {
  const number = (value: number) => formatLocalNumber(value, ctx.locale);
  const ended = weekend.state === 'ended';
  const position = new Map(weekend.members.map((m, i) => [m.tag, i + 1]));
  const attacks = weekend.members.reduce((sum, m) => sum + m.attacks, 0);
  const attackLimit = weekend.members.reduce((sum, m) => sum + m.attackLimit, 0);
  const looted = weekend.members.reduce((sum, m) => sum + m.looted, 0);
  const raidsCompleted = weekend.attackLog.filter(
    (log) => log.districtCount === log.districtsDestroyed,
  ).length;

  return {
    fileName: `crociata-nera-raid-${weekend.startTime.slice(0, 10)}`,
    title: ctx.t('raids.pdf.title'),
    subtitle: `${ctx.weekendLabel} · ${ctx.t('raids.state.' + weekend.state)}`,
    facts: [
      { label: ctx.t('raids.totalLoot'), value: number(weekend.totalLoot) },
      { label: ctx.t('raids.attacks'), value: number(weekend.totalAttacks) },
      { label: ctx.t('raids.pdf.participants'), value: number(weekend.members.length) },
      {
        label: ctx.t('raids.raidsCompleted'),
        value: ctx.t('raids.pdf.raidsValue', {
          raids: raidsCompleted,
          districts: weekend.districtsDestroyed,
        }),
      },
    ],
    columns: [
      { header: '#', width: 18, align: 'right', cell: (m) => position.get(m.tag) ?? '' },
      { header: ctx.t('common.player'), cell: (m) => ({ text: m.name, emphasis: 'strong' }) },
      {
        header: ctx.t('raids.attacksColumn'),
        width: 'auto',
        align: 'right',
        cell: (m) => ({
          text: `${m.attacks}/${m.attackLimit}`,
          emphasis: ended && m.attacks < m.attackLimit ? 'danger' : undefined,
        }),
      },
      {
        header: ctx.t('raids.looted'),
        width: 'auto',
        align: 'right',
        cell: (m) => number(m.looted),
      },
    ],
    groups: [{ rows: weekend.members }],
    footer: ['', ctx.t('raids.total'), `${attacks}/${attackLimit}`, number(looted)],
    emptyText: ctx.t('raids.pdf.empty'),
  };
}
