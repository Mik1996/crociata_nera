import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScrollFade } from './scroll-fade';

@Component({
  imports: [ScrollFade],
  template: `<div crnScrollFade id="area"><p>content</p></div>`,
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

  describe('watching the content', () => {
    let observed: Element[];
    let observeCalls: number;

    beforeEach(() => {
      observed = [];
      observeCalls = 0;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe = (target: Element) => observed.push(target) && observeCalls++;
          disconnect = () => (observed = []);
        },
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    @Component({
      imports: [ScrollFade],
      template: `<div crnScrollFade id="area">
        <p id="block">content</p>
        <span id="inline"><div id="projected">rows</div></span>
      </div>`,
    })
    class Nested {}

    async function render() {
      const fixture = TestBed.createComponent(Nested);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const byId = (id: string) => el.querySelector<HTMLElement>(`#${id}`)!;
      const settle = async () => {
        await new Promise((resolve) => setTimeout(resolve)); // mutation records delivered
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      };
      return { byId, settle };
    }

    const ids = () => observed.map((e) => e.id);

    it('observes the area, its children and, for an inline host, the children of the host', async () => {
      const { settle } = await render();
      await settle();
      expect(ids()).toEqual(['area', 'block', 'projected']);
    });

    it('observes again when the children of the area or of an inline host change', async () => {
      const { byId, settle } = await render();
      const added = document.createElement('section');
      added.id = 'added';
      byId('area').append(added);
      await settle();
      expect(ids()).toEqual(['area', 'block', 'projected', 'added']);

      const late = document.createElement('div');
      late.id = 'late';
      byId('inline').append(late);
      await settle();
      expect(ids()).toEqual(['area', 'block', 'projected', 'late', 'added']);
    });

    it('ignores changes deeper inside a child: its resize is what counts', async () => {
      const { byId, settle } = await render();
      await settle();
      const calls = observeCalls;
      byId('block').append(document.createElement('span'));
      byId('projected').append(document.createElement('div'));
      await settle();
      expect(observeCalls).toBe(calls); // not observed again: no mutation reported
    });
  });
});
