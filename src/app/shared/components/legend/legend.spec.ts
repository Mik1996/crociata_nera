import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Legend } from './legend';
import { LegendItem } from '../legend-item/legend-item';

@Component({
  imports: [Legend, LegendItem],
  template: `
    <crn-legend>
      <crn-legend-item color="var(--cn-lineup-starter)" glow>Titolari</crn-legend-item>
      <crn-legend-item color="var(--cn-red-text)">Esclusi</crn-legend-item>
    </crn-legend>
  `,
})
class Host {}

describe('Legend', () => {
  it('lists the entries with their colours', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('crn-legend')!.getAttribute('role')).toBe('list');
    const items = [...el.querySelectorAll<HTMLElement>('crn-legend-item')];
    expect(items.map((i) => i.getAttribute('role'))).toEqual(['listitem', 'listitem']);
    expect(items.map((i) => i.textContent!.trim())).toEqual(['Titolari', 'Esclusi']);
    expect(items[0].style.getPropertyValue('--legend-color')).toBe('var(--cn-lineup-starter)');
    const swatches = el.querySelectorAll('.legend-item__swatch');
    expect(swatches[0].classList).toContain('legend-item__swatch--glow');
    expect(swatches[1].classList).not.toContain('legend-item__swatch--glow');
  });
});
