import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { participantRows } from '../../../core/utils/war-stats';
import { sampleWar } from '../../../testing/fixtures';
import { WarParticipantsTable } from './war-participants-table';

describe('WarParticipantsTable', () => {
  let fixture: ComponentFixture<WarParticipantsTable>;

  // Access to the protected filter signals.
  const table = () =>
    fixture.componentInstance as unknown as {
      search: { set(v: string): void };
      townHall: { set(v: number | null): void };
      stars: { set(v: number | null): void };
      onlyWithoutAttacks: { set(v: boolean): void };
    };

  const visibleNames = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr.mat-mdc-row .cn-link-cell')).map(
      (a) => a.textContent?.trim(),
    );

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(WarParticipantsTable);
    fixture.componentRef.setInput('rows', participantRows(sampleWar()));
    fixture.componentRef.setInput('inProgress', true);
    await fixture.whenStable();
  });

  it('shows all participants sorted by map position', () => {
    expect(visibleNames()).toEqual(['Player #A', 'Player #B', 'Player #C']);
  });

  it('highlights players who have not attacked yet', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.row-without-attacks');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Non ha ancora attaccato');
  });

  it('filters by name', async () => {
    table().search.set('#b');
    await fixture.whenStable();
    expect(visibleNames()).toEqual(['Player #B']);
  });

  it('filters by town hall and by stars', async () => {
    table().townHall.set(16);
    await fixture.whenStable();
    expect(visibleNames()).toEqual(['Player #A']);

    table().townHall.set(null);
    table().stars.set(1);
    await fixture.whenStable();
    expect(visibleNames()).toEqual(['Player #B']);
  });

  it('filters only players without attacks and shows a message when nothing matches', async () => {
    table().onlyWithoutAttacks.set(true);
    await fixture.whenStable();
    expect(visibleNames()).toEqual(['Player #C']);

    table().search.set('nobody');
    await fixture.whenStable();
    expect(visibleNames()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Nessun partecipante corrisponde');
  });
});
