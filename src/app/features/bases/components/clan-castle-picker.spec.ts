import { TestBed } from '@angular/core/testing';
import { ClanCastleTroop } from '../../../core/game/clan-castle';
import { ClanCastlePicker } from './clan-castle-picker';

describe('ClanCastlePicker', () => {
  function render(capacity: number | null, value: ClanCastleTroop[] = []) {
    const fixture = TestBed.createComponent(ClanCastlePicker);
    const changes: ClanCastleTroop[][] = [];
    fixture.componentInstance.registerOnChange((troops) => changes.push(troops));
    fixture.componentInstance.writeValue(value);
    fixture.componentRef.setInput('capacity', capacity);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const troop = (name: string) =>
      el.querySelector<HTMLButtonElement>(`.catalogue button[aria-label^="Aggiungi ${name} "]`)!;
    return { fixture, el, changes, troop };
  }

  it('adds the same troop more than once while it fits, and disables what no longer fits', () => {
    const { fixture, el, changes, troop } = render(35);
    troop('Witch').click();
    troop('Witch').click();
    fixture.detectChanges();
    expect(changes.at(-1)).toEqual([{ name: 'Witch', count: 2 }]);
    expect(el.textContent).toContain('24/35 spazi');
    // 11 spaces left: a Valkyrie (8) fits, a Witch (12) or a Golem (30) does not.
    expect(troop('Valkyrie').disabled).toBe(false);
    expect(troop('Witch').disabled).toBe(true);
    expect(troop('Golem').disabled).toBe(true);
    troop('Golem').click();
    expect(changes).toHaveLength(2);
  });

  it('takes one away with the red "−" of a chosen troop, and empties the castle', () => {
    const { fixture, el, changes } = render(55, [
      { name: 'Golem', count: 1 },
      { name: 'Archer', count: 3 },
    ]);
    el.querySelector<HTMLButtonElement>('.chosen__remove[aria-label^="Togli un Archer"]')!.click();
    expect(changes.at(-1)).toEqual([
      { name: 'Golem', count: 1 },
      { name: 'Archer', count: 2 },
    ]);
    fixture.detectChanges();
    // The last one goes away from the castle altogether.
    el.querySelector<HTMLButtonElement>('.chosen__remove[aria-label^="Togli un Golem"]')!.click();
    expect(changes.at(-1)).toEqual([{ name: 'Archer', count: 2 }]);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.clear')!.click();
    expect(changes.at(-1)).toEqual([]);
  });

  it('waits for the town hall before offering troops', () => {
    const { el } = render(null);
    expect(el.textContent).toContain('Inserisci il link della base');
    expect(el.querySelector('.catalogue')).toBeNull();
  });
});
