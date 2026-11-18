import { RaidSeason } from '../../core/models';
import { PdfCell } from '../../shared/pdf/table-pdf';
import { raidMembersPdf } from './raid-members-pdf';

const WEEKEND: RaidSeason = {
  id: '2026-11-13T07:00:00.000Z',
  state: 'ended',
  startTime: '2026-11-13T07:00:00.000Z',
  endTime: '2026-11-16T07:00:00.000Z',
  totalLoot: 51000,
  raidsCompleted: 1,
  totalAttacks: 11,
  attackLog: [
    { districtCount: 8, districtsDestroyed: 8 },
    { districtCount: 8, districtsDestroyed: 5 },
  ] as RaidSeason['attackLog'],
  defenseLog: [],
  districtsDestroyed: 13,
  offensiveReward: 400,
  defensiveReward: 200,
  hasMembers: true,
  members: [
    { tag: '#A', name: 'Alpha', attacks: 6, attackLimit: 6, looted: 30000 },
    { tag: '#B', name: 'Beta', attacks: 5, attackLimit: 6, looted: 21000 },
  ],
};

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

describe('raidMembersPdf', () => {
  const pdf = raidMembersPdf(WEEKEND, { t, locale: 'it-IT', weekendLabel: '13 – 16 nov 2026' });

  it('lists who attacked in order, with the missing attacks in red once the weekend is over', () => {
    expect(pdf.fileName).toBe('crociata-nera-raid-2026-11-13');
    expect(pdf.subtitle).toBe('13 – 16 nov 2026 · raids.state.ended');
    const [rank, name, attacks, looted] = pdf.columns;
    const [alpha, beta] = pdf.groups[0].rows;
    expect([rank.cell(alpha), rank.cell(beta)]).toEqual([1, 2]);
    expect(name.cell(beta)).toEqual({ text: 'Beta', emphasis: 'strong' });
    expect((attacks.cell(alpha) as PdfCell).emphasis).toBeUndefined();
    expect(attacks.cell(beta)).toEqual({ text: '5/6', emphasis: 'danger' });
    expect(looted.cell(alpha)).toBe('30.000');
  });

  it('adds up the totals and the figures of the weekend', () => {
    expect(pdf.footer).toEqual(['', 'raids.total', '11/12', '51.000']);
    expect(pdf.facts!.map((f) => f.value)).toEqual([
      '51.000',
      '11',
      '2',
      'raids.pdf.raidsValue {"raids":1,"districts":13}',
    ]);
  });

  it('does not mark missing attacks while the weekend is in progress', () => {
    const ongoing = raidMembersPdf(
      { ...WEEKEND, state: 'ongoing' },
      { t, locale: 'it-IT', weekendLabel: '' },
    );
    expect((ongoing.columns[2].cell(WEEKEND.members[1]) as PdfCell).emphasis).toBeUndefined();
  });
});
