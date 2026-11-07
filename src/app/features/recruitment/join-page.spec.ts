import { TestBed } from '@angular/core/testing';
import { provideCocApiTest } from '../../testing/fixtures';
import { JoinPage } from './join-page';

describe('JoinPage', () => {
  it('shows the recruitment banner with the join link and the clan rules', async () => {
    TestBed.configureTestingModule({ providers: [provideCocApiTest()] });
    const fixture = TestBed.createComponent(JoinPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')!.textContent).toContain('Unisciti a noi');
    expect(el.querySelector<HTMLAnchorElement>('.enlist__cta')!.href).toBe(
      'https://link.clashofclans.com/it?action=OpenClanProfile&tag=%23TEST',
    );
    expect(el.querySelectorAll('.rule-group')).toHaveLength(5);
  });
});
