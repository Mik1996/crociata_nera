import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meter, MeterSegment } from './meter';

@Component({
  imports: [Meter],
  template: `<crn-meter
    [value]="value()"
    [max]="max()"
    [segments]="segments()"
    [label]="label()"
  />`,
})
class Host {
  value = signal(30);
  max = signal(60);
  segments = signal<MeterSegment[] | null>(null);
  label = signal<string | null>(null);
}

describe('Meter', () => {
  async function create() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host = () => fixture.nativeElement.querySelector('crn-meter') as HTMLElement;
    const widths = () =>
      [...host().querySelectorAll<HTMLElement>('.meter__fill')].map((f) => f.style.width);
    return { fixture, host, widths };
  }

  it('fills the share of the maximum and is decorative without a label', async () => {
    const { host, widths } = await create();
    expect(widths()).toEqual(['50%']);
    expect(host().getAttribute('aria-hidden')).toBe('true');
    expect(host().getAttribute('role')).toBeNull();
  });

  it('clamps values outside the track', async () => {
    const { fixture, widths } = await create();
    fixture.componentInstance.value.set(90);
    await fixture.whenStable();
    expect(widths()).toEqual(['100%']);
    fixture.componentInstance.value.set(-5);
    await fixture.whenStable();
    expect(widths()).toEqual(['0%']);
    fixture.componentInstance.max.set(0);
    fixture.componentInstance.value.set(3);
    await fixture.whenStable();
    expect(widths()).toEqual(['0%']);
  });

  it('draws the segments one after the other, never past the end', async () => {
    const { fixture, host, widths } = await create();
    fixture.componentInstance.max.set(100);
    fixture.componentInstance.segments.set([
      { value: 40, color: 'var(--cn-gold)' },
      { value: 30, color: 'var(--cn-red-mid)' },
      { value: 50, color: 'var(--cn-text-muted)' },
    ]);
    await fixture.whenStable();
    expect(widths()).toEqual(['40%', '30%', '30%']);
    const first = host().querySelector<HTMLElement>('.meter__fill')!;
    expect(first.style.background).toBe('var(--cn-gold)');
  });

  it('is a meter with the given text when labelled', async () => {
    const { fixture, host } = await create();
    fixture.componentInstance.label.set('30 su 60');
    await fixture.whenStable();
    expect(host().getAttribute('role')).toBe('meter');
    expect(host().getAttribute('aria-valuenow')).toBe('30');
    expect(host().getAttribute('aria-valuemax')).toBe('60');
    expect(host().getAttribute('aria-valuetext')).toBe('30 su 60');
    expect(host().getAttribute('aria-hidden')).toBeNull();
  });
});
