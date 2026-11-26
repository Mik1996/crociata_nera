import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { CwlSelectionPlayer } from '../../../core/backend/backend-api.types';
import { CwlSelectionService } from '../../../core/backend/cwl-selection.service';
import { provideCocApiTest } from '../../../testing/fixtures';
import { SelectionDecisionData, SelectionDecisionDialog } from './selection-decision-dialog';

/** A ranked player, as far as the dialog reads it. */
function player(rank: number, status: CwlSelectionPlayer['status']): CwlSelectionPlayer {
  return {
    rank,
    tag: `#P${rank}`,
    name: `Player ${rank}`,
    clanTag: '#TEST',
    townHallLevel: 17,
    status,
    score: 100 - rank,
  } as CwlSelectionPlayer;
}

/** 15 starters, 3 reserves, 2 out, an excluded and an ineligible player (not shown). */
const PLAYERS = [
  player(1, 'excluded'),
  ...Array.from({ length: 15 }, (_, i) => player(i + 2, 'starter')),
  ...[17, 18, 19].map((rank) => player(rank, 'reserve')),
  player(20, 'bench'),
  player(21, 'bench'),
  player(22, 'ineligible'),
];

describe('SelectionDecisionDialog', () => {
  function render(
    action: SelectionDecisionData['action'],
    service: Partial<CwlSelectionService>,
    players?: CwlSelectionPlayer[],
    starters = 15,
  ) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideCocApiTest(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { season: '2026-12', label: 'Dicembre 2026', action, players, starters },
        },
        { provide: MatDialogRef, useValue: { close } },
        { provide: CwlSelectionService, useValue: service },
      ],
    });
    const fixture = TestBed.createComponent(SelectionDecisionDialog);
    fixture.detectChanges();
    return { fixture, close, el: fixture.nativeElement as HTMLElement };
  }

  it('closes the selection and returns it', () => {
    const selection = { season: '2026-12', state: 'closed' };
    const closeSelection = vi.fn(() => of(selection));
    const { close, el } = render('close', { close: closeSelection } as never);
    expect(el.textContent).toContain('Dicembre 2026');
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(closeSelection).toHaveBeenCalledWith('2026-12', null);
    expect(close).toHaveBeenCalledWith(selection);
  });

  it('lists the eligible players to change the line-up by hand before closing', async () => {
    const selection = { season: '2026-12', state: 'closed' };
    const closeSelection = vi.fn(() => of(selection));
    const { fixture, close, el } = render('close', { close: closeSelection } as never, PLAYERS);
    const rows = [...el.querySelectorAll<HTMLElement>('.pick')];
    // Neither the excluded nor the ineligible player.
    expect(rows).toHaveLength(20);
    expect(rows[0].querySelector('.pick__name')!.textContent!.trim()).toBe('Player 2');
    const confirm = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const reset = el.querySelector<HTMLButtonElement>('.lineup__reset')!;
    const reason = () => el.querySelector('.disabled-reason');
    expect(reset.disabled).toBe(true);
    const place = (row: number, option: number) =>
      rows[row].querySelectorAll<HTMLButtonElement>('button.place')[option];

    // Two players out become starters: 17 starters, closing waits and says why.
    place(18, 0).click();
    place(19, 0).click();
    await fixture.whenStable();
    expect(place(18, 0).getAttribute('aria-checked')).toBe('true');
    expect(rows[18].textContent).toContain('era: Fuori');
    expect(el.querySelector('.lineup__counts')!.textContent).toContain('Titolari: 17');
    expect(confirm.disabled).toBe(true);
    expect(reason()!.textContent).toContain('Hai selezionato 17 titolari: devono essere 15.');

    // Two starters become reserves (5 reserves): 15 starters, it can be closed.
    place(13, 1).click();
    place(14, 1).click();
    // And a reserve goes out (4 reserves): reserves are free.
    place(15, 2).click();
    await fixture.whenStable();
    expect(reason()).toBeNull();
    expect(confirm.disabled).toBe(false);
    expect(reset.disabled).toBe(false);
    confirm.click();
    expect(closeSelection).toHaveBeenCalledWith('2026-12', {
      starters: [...PLAYERS.slice(1, 14).map((p) => p.tag), '#P20', '#P21'],
      reserves: ['#P15', '#P16', '#P18', '#P19'],
    });
    expect(close).toHaveBeenCalledWith(selection);
  });

  it('takes as many starters as the size picked for the selection', async () => {
    const closeSelection = vi.fn(() => of({}));
    const { fixture, el } = render('close', { close: closeSelection } as never, PLAYERS, 30);
    expect(el.querySelector('.lineup__hint')!.textContent).toContain('devono essere 30');
    // 16 starters by hand: a line-up of 30 needs 30.
    el.querySelectorAll<HTMLElement>('.pick')[18]
      .querySelectorAll<HTMLButtonElement>('button.place')[0]
      .click();
    await fixture.whenStable();
    expect(el.querySelector('.disabled-reason')!.textContent).toContain(
      'Hai selezionato 16 titolari: devono essere 30.',
    );
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });

  it('closes without reserves too', async () => {
    const closeSelection = vi.fn(() => of({}));
    const { fixture, el } = render('close', { close: closeSelection } as never, PLAYERS);
    const rows = [...el.querySelectorAll<HTMLElement>('.pick')];
    for (const row of rows.slice(15, 18))
      row.querySelectorAll<HTMLButtonElement>('button.place')[2].click();
    await fixture.whenStable();
    expect(el.querySelector('.lineup__counts')!.textContent).toContain('Riserve: 0');
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(closeSelection).toHaveBeenCalledWith('2026-12', {
      starters: PLAYERS.slice(1, 16).map((p) => p.tag),
      reserves: [],
    });
  });

  it('goes back to the ranking line-up', async () => {
    const closeSelection = vi.fn(() => of({}));
    const { fixture, el } = render('close', { close: closeSelection } as never, PLAYERS);
    const rows = [...el.querySelectorAll<HTMLElement>('.pick')];
    rows[2].querySelectorAll<HTMLButtonElement>('button.place')[2].click();
    await fixture.whenStable();
    expect(el.querySelector('.disabled-reason')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('.lineup__reset')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.disabled-reason')).toBeNull();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(closeSelection).toHaveBeenCalledWith('2026-12', null);
  });

  it('opens it again, and shows the errors of the backend', async () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { result: null, messages: [{ key: 'ERROR.CWL_SELECTION_CANNOT_REOPEN' }] },
    });
    const reopen = vi.fn(() => throwError(() => error));
    const { fixture, close, el } = render('reopen', { reopen } as never);
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
    expect(reopen).toHaveBeenCalledWith('2026-12');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(close).not.toHaveBeenCalled();
  });
});
