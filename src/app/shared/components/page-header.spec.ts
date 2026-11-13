import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader],
  template: `
    <app-page-header title="Guerra corrente" subtitle="Il campo brucia" kicker="Cronache del fronte" scene="war" crusader="fist" flush>
      <button type="button">Aggiorna</button>
      <p pageHero class="hero">24 – 30</p>
    </app-page-header>
    <app-page-header title="Giocatori" />
  `,
})
class Host {}

describe('PageHeader', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('app-page-header'));
  }

  it('shows kicker, title and tagline over the chosen scene, with the Crusader', async () => {
    const [header] = await render();
    expect(header.dataset['scene']).toBe('war');
    expect(header.classList.contains('page-header--flush')).toBe(true);
    expect(header.querySelector('.kicker')!.textContent).toContain('Cronache del fronte');
    expect(header.querySelector('h1')!.textContent).toBe('Guerra corrente');
    expect(header.querySelector('.subtitle')!.textContent).toBe('Il campo brucia');
    expect(header.querySelector('app-crusader')!.getAttribute('data-pose')).toBe('fist');
    // The scene is decoration only.
    expect(header.querySelector('.scene')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('projects the actions next to the title and the hero block below it', async () => {
    const [header] = await render();
    expect(header.querySelector('.actions button')!.textContent).toBe('Aggiorna');
    const hero = header.querySelector('.hero')!;
    expect(hero.parentElement).toBe(header);
    expect(header.querySelector('.actions .hero')).toBeNull();
  });

  it('defaults to the dusk scene, without kicker, tagline or Crusader', async () => {
    const [, header] = await render();
    expect(header.dataset['scene']).toBe('dusk');
    expect(header.classList.contains('page-header--flush')).toBe(false);
    expect(header.querySelector('.kicker')).toBeNull();
    expect(header.querySelector('.subtitle')).toBeNull();
    expect(header.querySelector('app-crusader')).toBeNull();
  });
});
