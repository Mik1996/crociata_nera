import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideCocApiTest } from '../../testing/fixtures';
import { CwlPage } from './cwl-page';

describe('CwlPage', () => {
  it('shows standings, rounds and player statistics of the latest season', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideCocApiTest()] });
    const fixture = TestBed.createComponent(CwlPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.standings tr.mat-mdc-row')).toHaveLength(8);
    expect(el.querySelector('.standings .cn-row-me')!.textContent).toContain('Crociata Nera');
    expect(el.querySelectorAll('.round')).toHaveLength(7);
    expect(el.querySelectorAll('.players tr.mat-mdc-row').length).toBeGreaterThanOrEqual(15);
    expect(el.querySelector('mat-select')).not.toBeNull();
  });
});
