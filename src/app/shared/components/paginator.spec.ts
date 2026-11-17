import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageEvent } from '@angular/material/paginator';
import { Paginator } from './paginator';

@Component({
  imports: [Paginator],
  template: `
    <crn-paginator
      [length]="45"
      [pageIndex]="index()"
      [pageSize]="10"
      [pageSizeOptions]="options()"
      label="Pagine dei giocatori"
      (page)="events.push($event)"
    />
  `,
})
class Host {
  index = signal(0);
  options = signal<number[]>([10, 25]);
  events: PageEvent[] = [];
}

describe('Paginator', () => {
  async function create() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  const button = (el: HTMLElement, cls: string) =>
    el.querySelector<HTMLButtonElement>(`.mat-mdc-paginator-navigation-${cls}`)!;

  it('shows the range in Italian and names the navigation', async () => {
    const f = await create();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('mat-paginator')!.getAttribute('aria-label')).toBe(
      'Pagine dei giocatori',
    );
    expect(el.querySelector('.mat-mdc-paginator-range-label')!.textContent).toContain('45');
  });

  it('emits the requested page', async () => {
    const f = await create();
    button(f.nativeElement, 'next').click();
    expect(f.componentInstance.events.map((e) => e.pageIndex)).toEqual([1]);
    expect(button(f.nativeElement, 'last')).not.toBeNull();
  });

  it('hides the rows-per-page choice without options', async () => {
    const f = await create();
    expect(f.nativeElement.querySelector('.mat-mdc-paginator-page-size')).not.toBeNull();
    f.componentInstance.options.set([]);
    await f.whenStable();
    expect(f.nativeElement.querySelector('.mat-mdc-paginator-page-size')).toBeNull();
  });
});
