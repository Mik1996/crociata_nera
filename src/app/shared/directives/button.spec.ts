import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { ButtonVariant, GameButton } from './button';

@Component({
  imports: [GameButton, MatButtonModule],
  template: `
    <button mat-flat-button class="own" [crnButton]="variant()">Elimina</button>
    <button mat-flat-button crnButton>Salva</button>
  `,
})
class Host {
  variant = signal<ButtonVariant>('danger');
}

describe('GameButton', () => {
  it('marks the variant and keeps the button classes', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [danger, primary] = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLElement>;
    expect(danger.classList).toContain('cn-button--danger');
    expect(danger.classList).toContain('own');
    expect(danger.classList).toContain('mat-mdc-unelevated-button');
    expect(primary.classList).toContain('cn-button--primary');

    fixture.componentInstance.variant.set('primary');
    await fixture.whenStable();
    expect(danger.classList).toContain('cn-button--primary');
    expect(danger.classList).not.toContain('cn-button--danger');
  });
});
