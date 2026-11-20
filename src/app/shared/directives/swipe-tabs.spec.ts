import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatTabGroup, MatTabNav, MatTabsModule } from '@angular/material/tabs';
import { SwipeTabs } from './swipe-tabs';

@Component({
  imports: [MatTabsModule, SwipeTabs],
  template: `
    <mat-tab-group crnSwipeTabs>
      <mat-tab label="One">1</mat-tab>
      <mat-tab label="Two">2</mat-tab>
    </mat-tab-group>
  `,
})
class Host {
  readonly group = viewChild.required(MatTabGroup);
}

@Component({
  imports: [MatTabsModule, SwipeTabs],
  template: `
    <nav mat-tab-nav-bar crnSwipeTabs [tabPanel]="panel">
      <a mat-tab-link>One</a>
      <a mat-tab-link [active]="true">Two</a>
    </nav>
    <mat-tab-nav-panel #panel />
  `,
})
class NavHost {
  readonly nav = viewChild.required(MatTabNav);
}

describe('SwipeTabs', () => {
  it('replaces the pagination arrows with a bar scrolled by the finger', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    expect(fixture.componentInstance.group().disablePagination).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mat-tab-group')!.classList,
    ).toContain('cn-swipe-tabs');
  });

  it('scrolls the bar to the selected tab', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const bar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.mat-mdc-tab-label-container',
    )!;
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
      (fixture.nativeElement as HTMLElement)
        .querySelectorAll<HTMLElement>('.mat-mdc-tab')[1]
        .click();
      await fixture.whenStable();

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
    } finally {
      if (stubbed) delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('works on a bar of links too, bringing a clicked link into view', async () => {
    const fixture = TestBed.createComponent(NavHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.nav().disablePagination).toBe(true);
    expect(el.querySelector('nav')!.classList).toContain('cn-swipe-tabs');

    const bar = el.querySelector<HTMLElement>('.mat-mdc-tab-link-container')!;
    const scrollTo = vi.fn();
    bar.scrollTo = scrollTo as unknown as typeof bar.scrollTo;
    el.querySelectorAll<HTMLElement>('.mat-mdc-tab-link')[0].click();
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
  });
});
