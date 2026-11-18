import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader],
  template: `
    <crn-page-header title="Guerra corrente" subtitle="Il campo brucia" kicker="Cronache del fronte" scene="war" crusader="fist" flush>
      <button type="button">Aggiorna</button>
      <p pageHero class="hero">24 – 30</p>
    </crn-page-header>
    <crn-page-header title="Giocatori" />
    <crn-page-header title="Dashboard" subtitle="Panoramica" kicker="Il quartier generale" crusader="guard" compact />
  `,
})
class Host {}

describe('PageHeader', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('crn-page-header'));
  }

  it('shows kicker, title and tagline over the chosen scene, with the Crusader', async () => {
    const [header] = await render();
    expect(header.dataset['scene']).toBe('war');
    expect(header.classList.contains('page-header--flush')).toBe(true);
    expect(header.querySelector('.kicker')!.textContent).toContain('Cronache del fronte');
    expect(header.querySelector('h1')!.textContent).toBe('Guerra corrente');
    expect(header.querySelector('.subtitle')!.textContent).toBe('Il campo brucia');
    expect(header.querySelector('crn-crusader')!.getAttribute('data-pose')).toBe('fist');
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
    expect(header.querySelector('crn-crusader')).toBeNull();
  });

  it('compact: keeps kicker and title, drops tagline and Crusader', async () => {
    const [full, , compact] = await render();
    expect(full.classList.contains('page-header--compact')).toBe(false);
    expect(compact.classList.contains('page-header--compact')).toBe(true);
    expect(compact.querySelector('.kicker')!.textContent).toContain('Il quartier generale');
    expect(compact.querySelector('h1')!.textContent).toBe('Dashboard');
    expect(compact.querySelector('.subtitle')).toBeNull();
    expect(compact.querySelector('crn-crusader')).toBeNull();
  });
});
