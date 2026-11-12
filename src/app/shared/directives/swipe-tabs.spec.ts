import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs';
import { SwipeTabs } from './swipe-tabs';

@Component({
  imports: [MatTabsModule, SwipeTabs],
  template: `
    <mat-tab-group appSwipeTabs>
      <mat-tab label="One">1</mat-tab>
      <mat-tab label="Two">2</mat-tab>
    </mat-tab-group>
  `,
})
class Host {
  readonly group = viewChild.required(MatTabGroup);
}

describe('SwipeTabs', () => {
  it('replaces the pagination arrows with a bar scrolled by the finger', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    expect(fixture.componentInstance.group().disablePagination).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-tab-group')!.classList).toContain(
      'cn-swipe-tabs',
    );
  });

  it('scrolls the bar to the selected tab', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const bar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.mat-mdc-tab-label-container')!;
    const scrollTo = vi.fn();
    bar.scrollTo = scrollTo as unknown as typeof bar.scrollTo;
    // jsdom has no matchMedia. The test files share one window: the stub must be a complete
    // MediaQueryList (e.g. the CDK BreakpointObserver reads it) and must be removed afterwards.
    const stubbed = typeof window.matchMedia !== 'function';
    if (stubbed) {
      window.matchMedia = ((media: string) => ({
        matches: false,
        media,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    }

    try {
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.mat-mdc-tab')[1].click();
      await fixture.whenStable();

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
    } finally {
      if (stubbed) delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });
});
