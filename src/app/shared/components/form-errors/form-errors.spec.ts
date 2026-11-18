import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BackendMessage } from '../../../core/backend/backend-api.types';
import { FormErrors } from './form-errors';

@Component({
  imports: [FormErrors],
  template: `<crn-form-errors [messages]="messages()" />`,
})
class Host {
  messages = signal<BackendMessage[]>([]);
}

describe('FormErrors', () => {
  it('translates every message as an alert, nothing when empty', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[role="alert"]').length).toBe(0);

    fixture.componentInstance.messages.set([
      { key: 'ERROR.INVALID_CREDENTIALS' },
      { key: 'ERROR.CLAN_CASTLE_OVER_CAPACITY', params: { used: 50, max: 45 } },
    ]);
    await fixture.whenStable();
    const alerts = [...el.querySelectorAll('[role="alert"]')].map((a) => a.textContent!.trim());
    expect(alerts.length).toBe(2);
    expect(alerts[0]).not.toBe('ERROR.INVALID_CREDENTIALS');
    expect(alerts[1]).toContain('50');
    expect(alerts[1]).toContain('45');
  });
});
