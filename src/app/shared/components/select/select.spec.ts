import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Select, SelectOption } from './select';

@Component({
  imports: [Select],
  template: `
    <crn-select label="Stagione" icon="calendar_month" [options]="options" [(value)]="value" />
  `,
})
class Host {
  options: SelectOption<number>[] = [
    { value: 1, label: 'Gennaio' },
    { value: 2, label: 'Febbraio', image: 'game/town-halls/th-2.webp' },
  ];
  value = signal(1);
}

describe('Select', () => {
  async function create() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  it('shows label, icon and the chosen option', async () => {
    const f = await create();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('mat-label')!.textContent).toBe('Stagione');
    expect(el.querySelector('crn-icon[matprefix]')).not.toBeNull();
    expect(el.querySelector('.mat-mdc-select-value')!.textContent!.trim()).toBe('Gennaio');
  });

  it('updates the value when an option is chosen', async () => {
    const f = await create();
    (f.nativeElement.querySelector('.mat-mdc-select-trigger') as HTMLElement).click();
    await f.whenStable();
    const options = document.querySelectorAll<HTMLElement>('mat-option');
    expect([...options].map((o) => o.textContent!.trim())).toEqual(['Gennaio', 'Febbraio']);
    options[1].click();
    await f.whenStable();
    expect(f.componentInstance.value()).toBe(2);
  });

  it('shows the pictures of the options, and the chosen one in place of the icon', async () => {
    const f = await create();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('img[matprefix]')).toBeNull();
    (el.querySelector('.mat-mdc-select-trigger') as HTMLElement).click();
    await f.whenStable();
    const options = document.querySelectorAll<HTMLElement>('mat-option');
    expect(options[0].querySelector('img')).toBeNull();
    expect(options[1].querySelector('img')!.getAttribute('src')).toBe('game/town-halls/th-2.webp');
    f.componentInstance.value.set(2);
    await f.whenStable();
    expect(el.querySelector('img[matprefix]')!.getAttribute('src')).toBe(
      'game/town-halls/th-2.webp',
    );
    expect(el.querySelector('crn-icon[matprefix]')).toBeNull();
  });
});
