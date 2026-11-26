import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/backend/auth.service';
import {
  CwlSelectionPermissions,
  CwlSelectionPlayer,
  CwlSelectionView,
} from '../../core/backend/backend-api.types';
import { CwlSelectionService } from '../../core/backend/cwl-selection.service';
import { PdfCell, TablePdf } from '../../shared/pdf/table-pdf';
import { TablePdfExporter } from '../../shared/pdf/table-pdf-exporter';
import { provideCocApiTest } from '../../testing/fixtures';
import { CwlSelectionPage } from './cwl-selection-page';

function player(rank: number, status: CwlSelectionPlayer['status']): CwlSelectionPlayer {
  return {
    rank,
    tag: `#P${rank}`,
    name: `Player ${rank}`,
    // '#TEST' is the main clan of the test configuration.
    clanTag: rank === 6 ? '#2RRYUGQYJ' : '#TEST',
    role: rank === 1 ? 'coLeader' : 'member',
    league:
      rank === 7
        ? null
        : { id: 105000030 - rank, name: `League ${rank}`, iconUrl: `https://x.io/l${rank}.png` },
    townHallLevel: status === 'ineligible' ? 15 : 17,
    eligible: status !== 'ineligible' && status !== 'excluded',
    status,
    score: 100 - rank,
    breakdown: {
      cwlCommendations: 25,
      cwlPerformance: 15,
      war: 20,
      heroes: 12,
      townHall: 10,
      league: 4,
      missedAttacks: rank === 2 ? -3 : 0,
      activity: rank === 5 ? -5 : 0,
    },
    war: {
      wars: 3,
      attacksUsed: 5,
      attacksAvailable: 6,
      averageStarsPerAttack: 2.6,
      averageDestruction: 91,
      maxPoints: rank === 3 ? 65 : 40,
    },
    cwl:
      rank === 3
        ? null
        : {
            clanTag: rank === 2 ? '#2JU8RPR2G' : '#2J8JVVCLC',
            allAttacks: rank === 1,
            striker: rank === 1 ? 'gold' : null,
            wars: 7,
            attacks: rank === 2 ? 6 : 7,
            missed: rank === 2 ? 1 : 0,
            averageStarsPerAttack: 2.4,
            averageDestruction: 88,
          },
    heroes: rank === 4 ? null : { levels: 92, equipment: 80 },
    activity: {
      joinedAt: rank === 5 ? '2026-11-10T00:00:00.000Z' : null,
      newcomer: rank === 5,
    },
    exclusion:
      status === 'excluded'
        ? {
            reason: 'Away all month',
            untilRevoked: rank === 1,
            excludedBy: 'boss',
            excludedAt: '2026-11-13T10:00:00.000Z',
          }
        : null,
  };
}

const SELECTION: CwlSelectionView = {
  season: '2026-12',
  state: 'open',
  signupStart: '2026-12-01T00:00:00.000Z',
  closedAt: null,
  closedBy: null,
  closedAutomatically: false,
  canReopen: false,
  seasons: [
    { season: '2026-12', state: 'open' },
    { season: '2026-11', state: 'closed' },
  ],
  generatedAt: '2026-11-14T10:00:00.000Z',
  starters: 15,
  reserves: 3,
  maxTownHall: 17,
  minEligibleTownHall: 16,
  cwlSeason: '2026-10',
  warWindow: { from: '2026-08-16T10:00:00.000Z', days: 90, wars: 20 },
  players: [
    player(1, 'excluded'),
    ...Array.from({ length: 15 }, (_, i) => player(i + 2, 'starter')),
    ...[17, 18, 19].map((rank) => player(rank, 'reserve')),
    player(20, 'bench'),
    player(21, 'ineligible'),
  ],
  permissions: { manage: true, export: true },
};

/** The ranking as the backend pages it (one page with every player). */
const PLAYERS_PAGE = {
  items: SELECTION.players,
  total: SELECTION.players.length,
  page: 1,
  limit: null,
};

const CLOSED: CwlSelectionView = {
  ...SELECTION,
  season: '2026-11',
  state: 'closed',
  signupStart: '2026-11-01T00:00:00.000Z',
  closedAt: '2026-11-01T09:12:00.000Z',
  closedBy: 'boss',
  canReopen: true,
};

describe('CwlSelectionPage', () => {
  afterEach(() => vi.useRealTimers());

  /** The actions are shown, as for administrators and the leader of Crociata Nera. */
  async function render() {
    const exporter = { download: vi.fn((_pdf: TablePdf<unknown>) => Promise.resolve()) };
    const service = {
      get: vi.fn((season?: string) => of(season === '2026-11' ? CLOSED : SELECTION)),
      getPlayersTable: vi.fn(() => of(PLAYERS_PAGE)),
      exclude: vi.fn(),
      readmit: vi.fn(() => of(undefined)),
      close: vi.fn(() => of(CLOSED)),
      reopen: vi.fn(() => of(SELECTION)),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideCocApiTest(),
        { provide: CwlSelectionService, useValue: service },
        { provide: TablePdfExporter, useValue: exporter },
      ],
    });
    const fixture = TestBed.createComponent(CwlSelectionPage);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, service, fixture, exporter };
  }

  it('keeps the order of the ranking and highlights starters, reserves and excluded players', async () => {
    const { el } = await render();
    const rows = [...el.querySelectorAll<HTMLTableRowElement>('tr.mat-mdc-row')];
    expect(rows).toHaveLength(21);
    expect(rows.map((r) => r.querySelector('td.rank')!.textContent!.trim())).toEqual(
      SELECTION.players.map((p) => String(p.rank)),
    );
    expect(el.querySelectorAll('tr.row--starter')).toHaveLength(15);
    expect(el.querySelectorAll('tr.row--reserve')).toHaveLength(3);
    expect(rows[0].classList).toContain('row--excluded');
    expect(rows[19].className).not.toMatch(/row--(starter|reserve)/);
    expect(rows[20].classList).toContain('row--ineligible');
  });

  it('labels the status in words, shows the reason of an exclusion and the CWL medals', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[0].querySelector('.mat-column-status crn-tag')!.textContent).toContain('Escluso');
    expect(rows[0].querySelector('.reason')!.textContent).toContain('Away all month');
    expect(rows[1].querySelector('.mat-column-status crn-tag')!.textContent).toContain('Titolare');
    expect(rows[16].querySelector('.mat-column-status crn-tag')!.textContent).toContain('Riserva');
    expect(rows[0].querySelectorAll('crn-commendation-medal')).toHaveLength(2);
    expect(rows[0].textContent).toContain('Co-capo');
  });

  it('shows the last CWL with its clan, attacks missed, penalties, new players and heroes', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[1].querySelector('.cwl-clan')!.textContent).toContain('Crociata Rossa');
    expect(rows[1].querySelector('.missing')!.textContent).toContain('1 saltati');
    expect(rows[1].querySelector('.penalty')!.textContent).toContain('-3');
    // Not in the last CWL: its points move to the regular wars.
    expect(rows[2].textContent).toContain('Non schierato');
    expect(rows[2].querySelector('.war-bonus')!.textContent).toContain('Fino a 65 punti');
    expect(rows[1].querySelector('.war-bonus')).toBeNull();
    expect(rows[4].querySelector('.flags crn-tag')!.textContent).toContain('Nuovo');
    expect(rows[3].textContent).toContain('In attesa');
    expect(rows[0].textContent).toContain('92%');
    // The score explains its parts.
    const score = rows[1].querySelector('.score')!.getAttribute('aria-label');
    expect(score).toContain('Attacchi saltati ultima CWL: -3,0');
    expect(score).toContain('Lega: 4,0 / 5');
    expect(score).toContain('Eroi: 12,0 / 20');
    const segments = rows[1].querySelectorAll<HTMLElement>('.score__bar .meter__fill');
    expect([...segments].map((s) => s.style.background)).toContain('var(--cn-score-league)');
  });

  it('shows the clan of the Crusade and the league of each player', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[0].querySelector('.meta')!.textContent).toContain('Crociata Nera');
    expect(rows[5].querySelector('.meta')!.textContent).toContain("Crociata d'Oro");
    const icon = rows[0].querySelector<HTMLImageElement>('.league-icon')!;
    expect(icon.getAttribute('src')).toBe('https://x.io/l1.png');
    expect(icon.alt).toBe('League 1');
    expect(rows[6].querySelector('.league-icon')).toBeNull();
  });

  it('explains the eligible town halls and the data considered', async () => {
    const { el } = await render();
    const facts = el.querySelector('.facts')!.textContent!;
    expect(facts).toContain('TH 16–17');
    expect(facts).toContain('Ultimi 90 giorni, tutti i clan (20 guerre)');
    expect(facts).toContain('Ottobre 2026');
    expect(el.querySelector('.legend')!.textContent).toContain('Esclusi: 1');
  });

  it('lets only administrators exclude and take back players', async () => {
    const { el, service, fixture } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[1].querySelector('td.actions button')!.textContent).toContain('Escludi');
    const readmit = rows[0].querySelector<HTMLButtonElement>('td.actions button')!;
    expect(readmit.textContent).toContain('Riammetti');
    readmit.click();
    await fixture.whenStable();
    expect(service.readmit).toHaveBeenCalledWith('#P1');
    // Summary and table asked again.
    expect(service.get).toHaveBeenCalledTimes(2);
    expect(service.getPlayersTable).toHaveBeenCalledTimes(2);
  });

  it('counts down to the sign-ups of the open selection, which administrators can close', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-22T10:30:00Z'), toFake: ['Date'] });
    const { el } = await render();
    const season = el.querySelector('.season')!;
    expect(season.querySelector('.season__title')!.textContent).toContain(
      'Selezioni aperte · CWL di Dicembre 2026',
    );
    expect(season.textContent).toContain('aprono il 1 dicembre: mancano 8 g 13 h 30 min');
    expect(season.querySelector('.season__action')!.textContent).toContain('Chiudi selezioni');
    // The exclusion until revoked says so.
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[0].querySelector('.until-revoked')!.textContent).toContain('Fino a revoca');
  });

  it('shows a closed selection frozen, without exclusions, and lets administrators reopen it', async () => {
    const { el, service, fixture } = await render();
    // The selector lists the seasons.
    el.querySelector<HTMLElement>('crn-select .mat-mdc-select-trigger, crn-select mat-select')!.click();
    await fixture.whenStable();
    const options = [...document.querySelectorAll<HTMLElement>('mat-option')];
    expect(options.map((o) => o.textContent!.trim())).toEqual([
      'Dicembre 2026 · aperta',
      'Novembre 2026 · chiusa',
    ]);
    options[1].click();
    await fixture.whenStable();
    expect(service.get).toHaveBeenLastCalledWith('2026-11');
    expect(service.getPlayersTable).toHaveBeenLastCalledWith(expect.anything(), '2026-11');
    const season = el.querySelector('.season')!;
    expect(season.classList).toContain('season--closed');
    expect(season.textContent).toContain('Chiuse il');
    expect(season.textContent).toContain('da boss');
    expect(season.querySelector('.season__action')!.textContent).toContain('Riapri');
    expect(el.querySelector('td.actions')).toBeNull();
  });

  /** The page as a member who may do no more than `permissions` (read from the backend). */
  async function renderWith(permissions: CwlSelectionPermissions) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideCocApiTest({ useMockApi: false }),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CwlSelectionService,
          useValue: {
            get: () => of({ ...SELECTION, permissions }),
            getPlayersTable: () => of(PLAYERS_PAGE),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CwlSelectionPage);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, fixture };
  }

  it('shows the ranking read-only to the members: no exclusions, closing, download nor share', async () => {
    const { el } = await renderWith({ manage: false, export: false });
    expect(el.querySelector('tr.mat-mdc-row')).not.toBeNull();
    expect(el.querySelector('td.actions')).toBeNull();
    expect(el.querySelector('.season__action')).toBeNull();
    expect(el.querySelector('crn-pdf-button')).toBeNull();
  });

  it('lets leaders and co-leaders download and share the line-up, not change it', async () => {
    const { el } = await renderWith({ manage: false, export: true });
    expect(el.querySelector('crn-pdf-button')).not.toBeNull();
    expect(el.querySelector('td.actions')).toBeNull();
    expect(el.querySelector('.season__action')).toBeNull();
  });

  it("highlights the signed-in user's own accounts in the ranking", async () => {
    const { el, fixture } = await renderWith({ manage: false, export: false });
    expect(el.querySelector('tr.cn-row-me')).toBeNull();
    TestBed.inject(AuthService).restoreSession();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/refresh')
      .flush({
        result: {
          accessToken: 't',
          accessTokenExpiresAt: '',
          user: {
            username: 'b',
            players: [
              { tag: '#P3', verified: true },
              { tag: '#P20', verified: true },
              // Old unverified link: not the user's.
              { tag: '#P4', verified: false },
            ],
          },
        },
        messages: [],
        status: { code: 200, name: 'HTTP_STATUS.OK' },
      });
    await fixture.whenStable();
    const mine = [...el.querySelectorAll('tr.cn-row-me')].map(
      (row) => row.querySelector('td.rank')!.textContent!.trim(),
    );
    expect(mine).toEqual(['3', '20']);
  });

  it('downloads the 15 starters, the 3 reserves on page 2 and the rules on page 3 as a PDF', async () => {
    const { el, fixture, exporter } = await render();
    // "Download" opens its menu: the PDF.
    el.querySelector<HTMLButtonElement>('crn-pdf-button button.download')!.click();
    await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('.download-pdf')!.click();
    await fixture.whenStable();
    const pdf = exporter.download.mock.calls[0][0] as TablePdf<CwlSelectionPlayer>;
    // Named after the month of the CWL of the selection.
    expect(pdf.fileName).toBe('selezioni-cwl-crociata-nera-dicembre');
    expect(pdf.title).toBe('Formazione CWL');
    const [starters, reserves] = pdf.groups;
    expect(starters).toMatchObject({
      title: 'Titolari: 15/15',
      accent: 'starter',
      pageTitle: 'Formazione CWL - Titolari',
    });
    expect(starters.pageBreakBefore).toBeFalsy();
    expect(starters.rows.map((p) => p.rank)).toEqual(Array.from({ length: 15 }, (_, i) => i + 2));
    expect(reserves).toMatchObject({
      title: 'Riserve: 3/3',
      accent: 'reserve',
      pageBreakBefore: true,
      pageTitle: 'Formazione CWL - Riserve',
    });
    expect(reserves.rows.map((p) => p.rank)).toEqual([17, 18, 19]);
    expect(pdf.notes).toMatchObject({
      title: 'Come si calcola la classifica',
      pageBreakBefore: true,
      pageTitle: 'Formazione CWL - Classifica',
    });
    expect(pdf.notes!.items).toHaveLength(10);
    // Position, league and town hall first; excluded, bench and ineligible players are left out.
    const [position, league, townHall, name, score, cwl] = pdf.columns;
    expect(townHall.cell(starters.rows[0])).toEqual({
      image: 'game/town-halls/th-17.webp',
      size: 20,
      fallback: '17',
    });
    expect(league.cell(starters.rows[0])).toMatchObject({
      image: 'game/league-tiers/105000028.webp',
    });
    expect(league.cell(starters.rows[5])).toMatchObject({ image: null, fallback: '—' });
    expect(position.cell(reserves.rows[0])).toBe(16);
    expect(name.cell(starters.rows[4])).toEqual({
      text: 'Player 6',
      emphasis: 'strong',
      note: "Crociata d'Oro · Membro",
    });
    expect((score.cell(starters.rows[0]) as PdfCell).text).toBe('98,0');
    expect(cwl.cell(starters.rows[1])).toEqual({ text: 'Non schierato', emphasis: 'muted' });
    expect(pdf.facts!.map((f) => f.value)).toContain('Ottobre 2026');
  });
});
