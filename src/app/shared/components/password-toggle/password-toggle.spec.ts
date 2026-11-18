import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PasswordToggle } from './password-toggle';

@Component({
  imports: [PasswordToggle],
  template: `
    <input [type]="show() ? 'text' : 'password'" />
    <crn-password-toggle [(visible)]="show" />
  `,
})
class Host {
  show = signal(false);
}

describe('PasswordToggle', () => {
  it('switches the password between hidden and shown', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('button')!;
    const input = el.querySelector('input')!;
    expect(button.getAttribute('aria-label')).toBe('Mostra la password');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(input.type).toBe('password');

    button.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.show()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(input.type).toBe('text');
    expect(el.querySelector('crn-icon')!.getAttribute('data-icon')).toBe('visibility_off');
  });
});
