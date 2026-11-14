import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { CwlSelectionService } from '../../../core/backend/cwl-selection.service';
import { provideCocApiTest } from '../../../testing/fixtures';
import { ExcludePlayerDialog } from './exclude-player-dialog';

describe('ExcludePlayerDialog', () => {
  function render(exclude: CwlSelectionService['exclude']) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideCocApiTest(),
        { provide: MAT_DIALOG_DATA, useValue: { tag: '#AAA', name: 'Alice', reason: null } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: CwlSelectionService, useValue: { exclude } },
      ],
    });
    const fixture = TestBed.createComponent(ExcludePlayerDialog);
    fixture.detectChanges();
    return { fixture, close, el: fixture.nativeElement as HTMLElement };
  }

  it('excludes the player with the reason typed, and closes with the exclusion', async () => {
    const exclusion = { reason: 'Away', excludedBy: 'boss', excludedAt: '' };
    const exclude = vi.fn(() => of(exclusion));
    const { fixture, close, el } = render(exclude);
    await fixture.whenStable();
    const textarea = el.querySelector('textarea')!;
    textarea.value = '  Away  ';
    textarea.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('button.submit')!.click();
    expect(exclude).toHaveBeenCalledWith('#AAA', 'Away');
    expect(close).toHaveBeenCalledWith(exclusion);
  });

  it('shows the errors of the backend and stays open', async () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { result: null, messages: [{ key: 'ERROR.EXCLUSION_REASON_IS_TOO_LONG' }] },
    });
    const { fixture, close, el } = render(() => throwError(() => error));
    el.querySelector<HTMLButtonElement>('button.submit')!.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('200 caratteri');
    expect(close).not.toHaveBeenCalled();
  });
});
