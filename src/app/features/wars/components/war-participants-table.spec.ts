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

  it('highlights the row of the signed-in player, with a "You" badge', async () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('tr.cn-row-me')).toBeNull();

    TestBed.inject(AuthService).restoreSession();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/refresh')
      .flush({
        result: { accessToken: 't', accessTokenExpiresAt: '', user: { username: 'b', playerTag: '#b', playerTagVerified: true } },
        messages: [],
        status: { code: 200, name: 'HTTP_STATUS.OK' },
      });
    await fixture.whenStable();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.cn-row-me');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.cn-link-cell')!.textContent!.trim()).toBe('Player #B');
    expect(rows[0].querySelector('.cn-me-badge')!.textContent!.trim()).toBe('Tu');
  });
});
