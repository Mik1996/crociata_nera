import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Altar3d } from './altar-3d';

@Component({
  imports: [Altar3d],
  template: `<crn-altar-3d imageUrl="game/war-leagues/master-1.webp" (ready)="ready.set($event)" />`,
})
class Host {
  readonly ready = signal<boolean | null>(null);
}

describe('Altar3d', () => {
  it('tells the parent to keep the flat trophy when WebGL is not available', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    // jsdom has no WebGL: the scene cannot start.
    expect(fixture.componentInstance.ready()).toBe(false);
    const altar = (fixture.nativeElement as HTMLElement).querySelector('crn-altar-3d')!;
    expect(altar.getAttribute('aria-hidden')).toBe('true');
    expect(altar.classList).not.toContain('altar-3d--ready');
  });
});
