import { TestBed } from '@angular/core/testing';
import { AuthPanel } from './auth-panel';

describe('AuthPanel', () => {
  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(AuthPanel);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the heading, the subtitle and the clan crest', async () => {
    const el = await render({ heading: 'Sign in', subtitle: 'Welcome back' });
    expect(el.querySelector('h1')?.textContent).toContain('Sign in');
    expect(el.querySelector('.panel__subtitle')?.textContent).toContain('Welcome back');
    expect(el.querySelector('.panel__emblem')?.getAttribute('src')).toBe(
      'images/clan-crest-black.webp',
    );
  });

  it('places a Crusader on each side in the poses chosen by the page', async () => {
    const el = await render({ heading: 'Sign up', pose: 'oath', sidePose: 'heart' });
    expect(el.querySelector('.stage')?.classList).toContain('stage--hero');
    const poses = [...el.querySelectorAll('crn-crusader')].map((c) => c.getAttribute('data-pose'));
    expect(poses).toEqual(['oath', 'heart']);
  });

  it('repeats the first pose on the right without a side pose', async () => {
    const el = await render({ heading: 'Sign in', pose: 'guard' });
    const poses = [...el.querySelectorAll('crn-crusader')].map((c) => c.getAttribute('data-pose'));
    expect(poses).toEqual(['guard', 'guard']);
  });

  it('has no Crusader without a pose', async () => {
    const el = await render({ heading: 'Sign in' });
    expect(el.querySelector('crn-crusader')).toBeNull();
    expect(el.querySelector('.stage')?.classList).not.toContain('stage--hero');
  });
});
