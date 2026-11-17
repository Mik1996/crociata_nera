import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TableHorizontalScroll } from './table-horizontal-scroll';

@Component({
  imports: [TableHorizontalScroll],
  template: `
    <div class="crn-table__scroll" style="width: 200px; overflow-x: auto">
      <table style="width: 600px">
        <tr><td>Name</td><td>1</td></tr>
      </table>
    </div>
  `,
})
class Host {}

describe('TableHorizontalScroll', () => {
  /** Waits for the measurement scheduled on the next animation frame. */
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

  /** Sets the scroll metrics the test DOM does not compute. */
  function metrics(wrap: HTMLElement, scrollLeft: number) {
    Object.defineProperty(wrap, 'scrollWidth', { configurable: true, value: 600 });
    Object.defineProperty(wrap, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(wrap, 'scrollLeft', { configurable: true, value: scrollLeft });
  }

  it('marks more columns beyond the right edge until the table is scrolled to its end', async () => {
    const fixture = TestBed.createComponent(Host);
    const wrap = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.crn-table__scroll')!;
    metrics(wrap, 0);
    await fixture.whenStable();
    await frame();
    await fixture.whenStable();
    expect(wrap.classList.contains('crn-table__scroll--more-x')).toBe(true);

    metrics(wrap, 400);
    wrap.dispatchEvent(new Event('scroll'));
    await frame();
    await fixture.whenStable();
    // At the right end: nothing more to show.
    expect(wrap.classList.contains('crn-table__scroll--more-x')).toBe(false);
  });
});
