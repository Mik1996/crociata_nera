import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Alert, AlertTone } from './alert';
import { IconName } from '../icon/icon-names';

@Component({
  imports: [Alert],
  template: `<crn-alert [tone]="tone()" [icon]="icon()"><p>Messaggio</p></crn-alert>`,
})
class Host {
  tone = signal<AlertTone>('error');
  icon = signal<IconName | null | undefined>(undefined);
}

describe('Alert', () => {
  async function create() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const alert = () => fixture.nativeElement.querySelector('crn-alert') as HTMLElement;
    const icon = () => alert().querySelector('crn-icon')?.getAttribute('data-icon') ?? null;
    return { fixture, alert, icon };
  }

  it('announces errors with the error icon', async () => {
    const { alert, icon } = await create();
    expect(alert().getAttribute('role')).toBe('alert');
    expect(alert().classList).toContain('alert--error');
    expect(icon()).toBe('error');
    expect(alert().textContent!.trim()).toBe('Messaggio');
  });

  it('uses role status and the tone icon for the other tones', async () => {
    const { fixture, alert, icon } = await create();
    fixture.componentInstance.tone.set('success');
    await fixture.whenStable();
    expect(alert().getAttribute('role')).toBe('status');
    expect(icon()).toBe('check_circle');
    fixture.componentInstance.tone.set('info');
    await fixture.whenStable();
    expect(icon()).toBeNull();
  });

  it('takes a different icon, or none', async () => {
    const { fixture, icon } = await create();
    fixture.componentInstance.icon.set('link_off');
    await fixture.whenStable();
    expect(icon()).toBe('link_off');
    fixture.componentInstance.icon.set(null);
    await fixture.whenStable();
    expect(icon()).toBeNull();
  });
});
