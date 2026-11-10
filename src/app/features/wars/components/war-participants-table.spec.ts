import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/backend/auth.service';
import { participantRows } from '../../../core/utils/war-stats';
import { provideCocApiTest, sampleWar } from '../../../testing/fixtures';
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
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: true })],
    });
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

  const signIn = async (players: { tag: string; verified: boolean }[]) => {
    TestBed.inject(AuthService).restoreSession();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/refresh')
      .flush({
        result: { accessToken: 't', accessTokenExpiresAt: '', user: { username: 'b', players } },
        messages: [],
        status: { code: 200, name: 'HTTP_STATUS.OK' },
      });
    await fixture.whenStable();
  };

  const nameOf = (row: Element) => row.querySelector('.cn-link-cell')!.textContent!.trim();

  it('marks all the signed-in user\'s verified accounts with a "You" badge, keeping the attack colours while the war is in progress', async () => {
    await signIn([
      { tag: '#B', verified: true },
      { tag: '#C', verified: true },
      // Old unverified link: not marked as "you".
      { tag: '#A', verified: false },
    ]);

    const el = fixture.nativeElement as HTMLElement;
    const badged = [...el.querySelectorAll('tr.mat-mdc-row')].filter((r) => r.querySelector('.cn-me-badge'));
    expect(badged.map(nameOf)).toEqual(['Player #B', 'Player #C']);
    expect(badged[0].querySelector('.cn-me-badge')!.textContent!.trim()).toBe('Tu');
    expect(el.querySelector('tr.cn-row-me')).toBeNull();

    const without = el.querySelector('tr.row-without-attacks')!;
    expect(nameOf(without)).toBe('Player #C');
    expect(without.textContent).toContain('Non hai ancora attaccato');
    expect(without.textContent).not.toContain('Non ha ancora attaccato');
  });

  it("highlights the signed-in user's rows once the war has ended", async () => {
    fixture.componentRef.setInput('inProgress', false);
    await signIn([{ tag: '#B', verified: true }]);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.cn-row-me');
    expect([...rows].map(nameOf)).toEqual(['Player #B']);
  });

  it('shows no attack status during the preparation day', async () => {
    fixture.componentRef.setInput('preparation', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tr.row-without-attacks, tr.row-partial-attacks')).toBeNull();
    expect(el.querySelector('.attack-status')).toBeNull();
  });
});
