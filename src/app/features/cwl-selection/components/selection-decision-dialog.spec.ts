import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { CwlSelectionService } from '../../../core/backend/cwl-selection.service';
import { provideCocApiTest } from '../../../testing/fixtures';
import { SelectionDecisionData, SelectionDecisionDialog } from './selection-decision-dialog';

describe('SelectionDecisionDialog', () => {
  function render(action: SelectionDecisionData['action'], service: Partial<CwlSelectionService>) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideCocApiTest(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { season: '2026-12', label: 'Dicembre 2026', action },
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
    expect(closeSelection).toHaveBeenCalledWith('2026-12');
    expect(close).toHaveBeenCalledWith(selection);
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
