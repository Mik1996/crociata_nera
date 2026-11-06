import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { provideCocApiTest } from '../../testing/fixtures';
import { CurrentWarPage } from './current-war-page';

describe('CurrentWarPage', () => {
  function configure() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
  }

  async function render() {
    const fixture = TestBed.createComponent(CurrentWarPage);
    await fixture.whenStable();
    // The resource emits after the first cycle: wait for a second stabilization round.
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows clan, opponent and participants of the current war', async () => {
    configure();
    const el = await render();
    expect(el.querySelector('app-war-summary')?.textContent).toContain('Crociata Nera');
    expect(el.querySelectorAll('tr.mat-mdc-row').length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Non ha ancora attaccato');
  });

  it('shows a message when the clan is not at war', async () => {
    configure();
    vi.spyOn(TestBed.inject(CocApiService), 'getCurrentWar').mockReturnValue(of(null));
    const el = await render();
    expect(el.textContent).toContain('non è attualmente in guerra');
  });

  it('shows the error state when the API fails', async () => {
    configure();
    vi.spyOn(TestBed.inject(CocApiService), 'getCurrentWar').mockReturnValue(
      throwError(() => new Error('API unreachable')),
    );
    const el = await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('API unreachable');
  });
});
