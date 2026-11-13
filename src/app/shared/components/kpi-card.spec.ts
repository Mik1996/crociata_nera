import { TestBed } from '@angular/core/testing';
import { KpiCard } from './kpi-card';

describe('KpiCard', () => {
  function render(inputs: Record<string, unknown>): HTMLElement {
    const fixture = TestBed.createComponent(KpiCard);
    fixture.componentRef.setInput('label', 'Stars');
    fixture.componentRef.setInput('value', 3);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a single picture in place of the icon', () => {
    const el = render({ image: 'game/misc/star.webp', icon: 'star' });
    expect(el.querySelectorAll('.kpi__image')).toHaveLength(1);
    expect(el.querySelector('.kpi__triangle')).toBeNull();
    expect(el.querySelector('mat-icon')).toBeNull();
  });

  it('shows the picture three times in a triangle', () => {
    const el = render({ image: 'game/misc/star.webp', imageTriangle: true });
    const images = Array.from(el.querySelectorAll('.kpi__triangle img'));
    expect(images.map((img) => img.getAttribute('src'))).toEqual(Array(3).fill('game/misc/star.webp'));
    expect(el.querySelector('.kpi__image')).toBeNull();
  });

  it('shows the Material icon when there is no picture', () => {
    const el = render({ icon: 'groups' });
    expect(el.querySelector('mat-icon')?.textContent).toBe('groups');
  });
});
