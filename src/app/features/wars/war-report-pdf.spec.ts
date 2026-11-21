import { War, WarParticipant } from '../../core/models';
import { PdfCell } from '../../shared/pdf/table-pdf';
import { warReportPdf } from './war-report-pdf';

const attack = (
  attackerTag: string,
  defenderTag: string,
  stars: number,
  destruction: number,
  order: number,
) => ({
  attackerTag,
  defenderTag,
  stars,
  destructionPercentage: destruction,
  order,
  durationSeconds: 120,
});

const member = (
  tag: string,
  name: string,
  mapPosition: number,
  attacks: ReturnType<typeof attack>[],
  best?: ReturnType<typeof attack>,
): WarParticipant => ({
  tag,
  name,
  townHall: 17,
  mapPosition,
  attacks,
  opponentAttacks: best ? 1 : 0,
  bestOpponentAttack: best,
});

const WAR: War = {
  id: '20261119T213344-OPP',
  state: 'ended',
  preparationStartTime: '2026-11-17T21:33:44.000Z',
  startTime: '2026-11-18T21:33:44.000Z',
  endTime: '2026-11-19T21:33:44.000Z',
  teamSize: 2,
  attacksPerMember: 2,
  hasDetails: true,
  clan: {
    tag: '#CN',
    name: 'Crociata Nera',
    level: 16,
    stars: 5,
    destructionPercentage: 92.5,
    attacksUsed: 3,
    members: [
      member('#B', 'Bruno', 2, [attack('#B', '#Y', 2, 85, 3)], attack('#X', '#B', 3, 100, 1)),
      member('#A', 'Anna', 1, [attack('#A', '#Y', 3, 100, 4), attack('#A', '#X', 0, 40, 2)]),
    ],
  },
  opponent: {
    tag: '#OPP',
    name: 'Les Gaulois',
    level: 12,
    stars: 3,
    destructionPercentage: 70,
    attacksUsed: 2,
    members: [member('#X', 'X', 1, []), member('#Y', 'Y', 2, [])],
  },
};

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

describe('warReportPdf', () => {
  const pdf = warReportPdf(WAR, { t, locale: 'it-IT', dayLabel: '19 nov 2026' });
  const cell = (header: string, row: WarParticipant) =>
    pdf.columns.find((c) => c.header === header)!.cell(row);

  it('lists the participants in map order, each attack with its target and the missed ones in red', () => {
    expect(pdf.fileName).toBe('crociata-nera-war-2026-11-19');
    const [anna, bruno] = pdf.groups[0].rows;
    expect([anna.name, bruno.name]).toEqual(['Anna', 'Bruno']);
    // In the order they were made: 0★ on #X (position 1) first.
    expect(cell('warDetail.pdf.attack {"n":1}', anna)).toBe('0★ 40% → 1');
    expect(cell('warDetail.pdf.attack {"n":2}', anna)).toBe('3★ 100% → 2');
    expect(cell('warDetail.pdf.attack {"n":2}', bruno)).toEqual({
      text: 'warDetail.pdf.missed',
      emphasis: 'danger',
    });
    expect((cell('common.stars', anna) as PdfCell).text).toBe('3');
    expect(cell('warDetail.pdf.defense', bruno)).toBe('3★ 100%');
    expect(cell('warDetail.pdf.defense', anna)).toEqual({ text: '—', emphasis: 'muted' });
  });

  it('shows the figures of the war, the totals and a legend', () => {
    expect(pdf.facts!.map((f) => f.value)).toEqual([
      'result.victory',
      '5 – 3',
      '92,5% – 70%',
      '3/4',
    ]);
    expect(pdf.footer).toEqual(['', '', 'warDetail.pdf.total', '3/4', '', '5', '']);
    expect(pdf.notes!.items).toHaveLength(3);
  });

  it('does not mark the attacks not made yet while the war is in progress', () => {
    const live = warReportPdf({ ...WAR, state: 'battle' }, { t, locale: 'it-IT', dayLabel: '' });
    const bruno = live.groups[0].rows[1];
    expect(
      live.columns.find((c) => c.header === 'warDetail.pdf.attack {"n":2}')!.cell(bruno),
    ).toEqual({ text: '—', emphasis: 'muted' });
  });
});
