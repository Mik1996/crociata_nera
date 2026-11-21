import { townHallImage } from '../../core/game/units';
import { formatLocalNumber } from '../../core/i18n/locale-pipes';
import { Attack, War, WarParticipant } from '../../core/models';
import { warResult } from '../../core/utils/war-stats';
import { PdfCellValue, PdfColumn, TablePdf } from '../../shared/pdf/table-pdf';

/** What the war report needs from the page: translations, locale and the day of the war. */
export interface WarReportPdfContext {
  t(key: string, params?: Record<string, unknown>): string;
  locale: string;
  /** The day the war ended, e.g. `19 nov 2026`. */
  dayLabel: string;
}

/** Side of the town hall pictures, in points. */
const PICTURE_SIZE = 20;

/**
 * The report of a war for the leaders: every participant in map order with each attack (stars,
 * destruction and the position of the base attacked; the attacks not used in red once the war is
 * over), the stars of the player and the best attack the player's base took; the war's figures above.
 */
export function warReportPdf(war: War, ctx: WarReportPdfContext): TablePdf<WarParticipant> {
  const percent = (value: number) => `${formatLocalNumber(value, ctx.locale, '1.0-1')}%`;
  const ended = war.state === 'ended';
  const positions = new Map(war.opponent.members.map((m) => [m.tag, m.mapPosition]));
  const members = [...war.clan.members].sort((a, b) => a.mapPosition - b.mapPosition);
  const stars = (m: WarParticipant) => m.attacks.reduce((sum, a) => sum + a.stars, 0);
  const attack = (a: Attack) =>
    `${a.stars}★ ${percent(a.destructionPercentage)} → ${positions.get(a.defenderTag) ?? '?'}`;

  const attackColumns: PdfColumn<WarParticipant>[] = Array.from(
    { length: war.attacksPerMember },
    (_, i) => ({
      header: ctx.t('warDetail.pdf.attack', { n: i + 1 }),
      width: 'auto',
      cell: (m): PdfCellValue => {
        const a = [...m.attacks].sort((x, y) => x.order - y.order)[i];
        if (a) return attack(a);
        return ended
          ? { text: ctx.t('warDetail.pdf.missed'), emphasis: 'danger' }
          : { text: '—', emphasis: 'muted' };
      },
    }),
  );
  const used = war.clan.attacksUsed;
  const total = war.teamSize * war.attacksPerMember;
  const opponentStars = (m: WarParticipant) =>
    m.bestOpponentAttack
      ? `${m.bestOpponentAttack.stars}★ ${percent(m.bestOpponentAttack.destructionPercentage)}`
      : { text: '—', emphasis: 'muted' as const };

  return {
    fileName: `crociata-nera-war-${war.endTime.slice(0, 10)}`,
    title: ctx.t('warDetail.pdf.title'),
    subtitle: `${ctx.t('warDetail.versus', { name: war.opponent.name })} · ${ctx.t('common.sizeVs', { n: war.teamSize })} · ${ctx.dayLabel}`,
    facts: [
      { label: ctx.t('common.result'), value: ctx.t('result.' + warResult(war)) },
      { label: ctx.t('common.stars'), value: `${war.clan.stars} – ${war.opponent.stars}` },
      {
        label: ctx.t('common.destruction'),
        value: `${percent(war.clan.destructionPercentage)} – ${percent(war.opponent.destructionPercentage)}`,
      },
      { label: ctx.t('common.attacksUsed'), value: `${used}/${total}` },
    ],
    columns: [
      { header: '#', width: 18, align: 'right', cell: (m) => m.mapPosition },
      {
        header: ctx.t('common.th'),
        width: 28,
        align: 'center',
        cell: (m) => ({
          image: townHallImage(m.townHall) ?? null,
          size: PICTURE_SIZE,
          fallback: String(m.townHall),
        }),
      },
      { header: ctx.t('common.player'), cell: (m) => ({ text: m.name, emphasis: 'strong' }) },
      ...attackColumns,
      {
        header: ctx.t('common.stars'),
        width: 'auto',
        align: 'right',
        cell: (m) => ({ text: String(stars(m)), emphasis: 'strong' }),
      },
      {
        header: ctx.t('warDetail.pdf.defense'),
        width: 'auto',
        align: 'right',
        cell: opponentStars,
      },
    ],
    groups: [{ rows: members }],
    footer: [
      '',
      '',
      ctx.t('warDetail.pdf.total'),
      ...attackColumns.map((_, i) => (i === 0 ? `${used}/${total}` : '')),
      String(war.clan.stars),
      '',
    ],
    emptyText: ctx.t('warDetail.pdf.empty'),
    notes: {
      title: ctx.t('warDetail.pdf.legendTitle'),
      items: [
        ctx.t('warDetail.pdf.legendAttack'),
        ctx.t('warDetail.pdf.legendDefense'),
        ctx.t('warDetail.pdf.legendMissed'),
      ],
    },
  };
}
