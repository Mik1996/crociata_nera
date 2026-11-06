import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScrollFade } from './scroll-fade';

@Component({
  imports: [ScrollFade],
  template: `<div appScrollFade id="area"><p>content</p></div>`,
})
class Host {}

describe('ScrollFade', () => {
  /** jsdom has no layout: fake the scroll metrics of the area. */
  function metrics(el: HTMLElement, values: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(el, key, { configurable: true, value });
  }

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('#area')!;
    const scrollTo = async (values: { scrollTop: number; scrollHeight: number; clientHeight: number }) => {
      metrics(area, values);
      area.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await fixture.whenStable();
    };
    return { area, scrollTo };
  }

  it('shows the bottom hint at the top, both in the middle and the top hint at the end', async () => {
    const { area, scrollTo } = await render();
    expect(area.classList).toContain('cn-scroll-fade');

    await scrollTo({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
    expect(area.classList.contains('cn-scroll-fade--top')).toBe(false);
    expect(area.classList.contains('cn-scroll-fade--bottom')).toBe(true);

    await scrollTo({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 });
    expect(area.classList.contains('cn-scroll-fade--top')).toBe(true);
    expect(area.classList.contains('cn-scroll-fade--bottom')).toBe(true);

    await scrollTo({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 });
    expect(area.classList.contains('cn-scroll-fade--top')).toBe(true);
    expect(area.classList.contains('cn-scroll-fade--bottom')).toBe(false);
  });

  it('shows nothing when the content fits', async () => {
    const { area, scrollTo } = await render();
    await scrollTo({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 });
    expect(area.className).not.toMatch(/cn-scroll-fade--/);
  });
});
