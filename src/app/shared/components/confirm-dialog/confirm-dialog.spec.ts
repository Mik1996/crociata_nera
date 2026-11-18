import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { BackendMessage } from '../../../core/backend/backend-api.types';
import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `
    <crn-confirm-dialog
      title="Eliminare la base?"
      confirmLabel="Elimina"
      [busy]="busy()"
      [disabled]="disabled()"
      [errors]="errors()"
      danger
      (confirm)="confirms = confirms + 1"
    >
      <p class="intro">Non si torna indietro.</p>
      <input name="typed" />
    </crn-confirm-dialog>
  `,
})
class Host {
  busy = signal(false);
  disabled = signal(false);
  errors = signal<BackendMessage[]>([]);
  confirms = 0;
}

describe('ConfirmDialog', () => {
  const close = vi.fn();

  async function create() {
    TestBed.configureTestingModule({ providers: [{ provide: MatDialogRef, useValue: { close } }] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const [cancel, confirm] = el.querySelectorAll('button');
    return { fixture, el, cancel, confirm };
  }

  it('shows title, content and the two actions', async () => {
    const { el, cancel, confirm } = await create();
    expect(el.querySelector('h2')!.textContent).toBe('Eliminare la base?');
    expect(el.querySelector('mat-dialog-content .intro')).not.toBeNull();
    expect(cancel.textContent!.trim()).toBe('Annulla');
    expect(confirm.textContent!.trim()).toBe('Elimina');
    expect(confirm.classList).toContain('cn-button--danger');
  });

  it('confirms with the button and with Enter in a field', async () => {
    const { fixture, el, confirm } = await create();
    confirm.click();
    el.querySelector('form')!.requestSubmit();
    expect(fixture.componentInstance.confirms).toBe(2);
  });

  it('does not confirm while busy or disabled', async () => {
    const { fixture, el, confirm } = await create();
    fixture.componentInstance.busy.set(true);
    await fixture.whenStable();
    expect(confirm.disabled).toBe(true);
    el.querySelector('form')!.requestSubmit();
    fixture.componentInstance.busy.set(false);
    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    expect(confirm.disabled).toBe(true);
    el.querySelector('form')!.requestSubmit();
    expect(fixture.componentInstance.confirms).toBe(0);
  });

  it('closes on cancel and shows the errors', async () => {
    const { fixture, el, cancel } = await create();
    cancel.click();
    expect(close).toHaveBeenCalled();
    fixture.componentInstance.errors.set([{ key: 'ERROR.INVALID_CREDENTIALS' }]);
    await fixture.whenStable();
    expect(el.querySelectorAll('[role="alert"]').length).toBe(1);
  });
});
