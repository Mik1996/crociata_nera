import { Component, signal, viewChildren } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScrollyAct } from './scrolly-act';
import { ScrollyCounter } from './scrolly-counter';
import { ScrollyIndex } from './scrolly-index';
import { ScrollyRoot } from './scrolly-root';

@Component({
  imports: [ScrollyRoot, ScrollyAct, ScrollyCounter, ScrollyIndex],
  template: `
    <div crnScrollyRoot #root="scrollyRoot" id="port" style="overflow-y: auto">
      <crn-scrolly-index label="Acts" />
      <section crnScrollyAct actId="one" actLabel="One" [actLength]="3">
        <span id="counter" [crnScrollyCounter]="1000" [counterFrom]="0" [counterTo]="1"></span>
        @if (late()) {
          <span id="late" [crnScrollyCounter]="200" [counterFrom]="0" [counterTo]="0.5"></span>
        }
      </section>
      <section crnScrollyAct actId="gap"></section>
      <section crnScrollyAct actId="two" actLabel="Two"></section>
    </div>
  `,
})
class Host {
  readonly acts = viewChildren(ScrollyAct);
  /** Data arriving after the act has been measured (rankings, records). */
  readonly late = signal(false);
}

/** jsdom has no layout: fakes sizes and positions. */
function fake(el: Element, props: { top?: number; height?: number; scrollHeight?: number; clientHeight?: number }) {
  if (props.top !== undefined || props.height !== undefined) {
    const top = props.top ?? 0;
    const height = props.height ?? 0;
    el.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) });
  }
  for (const key of ['scrollHeight', 'clientHeight'] as const) {
    if (props[key] !== undefined) Object.defineProperty(el, key, { configurable: true, value: props[key] });
  }
}

describe('Scrollytelling engine', () => {
  let reducedMotion = false;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    reducedMotion = false;
    // Complete enough for the other users of matchMedia (e.g. the CDK BreakpointObserver).
    window.matchMedia = ((query: string) => ({
      media: query,
      matches: query.includes('reduced-motion') && reducedMotion,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  // Never leak the fake into the other test files of the same worker.
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const port = el.querySelector<HTMLElement>('#port')!;
    const [one, gap, two] = ['one', 'gap', 'two'].map((id) => el.querySelector<HTMLElement>(`#${id}`)!);
    const root = fixture.debugElement.children[0].injector.get(ScrollyRoot);
    // A scrollport 800 px tall at the top of the window, scrolled 1200 px down.
    fake(port, { top: 0, height: 800, scrollHeight: 5000, clientHeight: 800 });
    fake(one, { top: -1200, height: 2400 });
    fake(gap, { top: 1200, height: 100 });
    fake(two, { top: 1300, height: 600 });
    const refresh = async () => {
      window.dispatchEvent(new Event('resize'));
      root.refresh();
      await fixture.whenStable();
    };
    await refresh();
    return { fixture, el, port, one, two, root, refresh };
  }

  it('measures every act against the scrollport and writes the CSS custom properties', async () => {
    const { fixture, port, one, two } = await render();

    expect(port.style.getPropertyValue('--scrolly-vh')).toBe('800px');
    expect(one.classList).toContain('scrolly-act--pinned');
    expect(one.style.getPropertyValue('--act-length')).toBe('3');
    expect(one.style.getPropertyValue('--p')).toBe('0.7500');
    expect(one.style.getPropertyValue('--enter')).toBe('1.0000');
    expect(one.style.getPropertyValue('--top')).toBe('-1200px');
    expect(one.dataset['actState']).toBe('active');
    expect(two.dataset['actState']).toBe('before');

    const [act1, , act2] = fixture.componentInstance.acts();
    expect(act1.current?.progress).toBe(0.75);
    expect(act1.seen()).toBe(true);
    expect(act2.near()).toBe(true);
  });

  it('numbers the labelled acts and keeps the index on the one in the middle of the screen', async () => {
    const { fixture, el, root } = await render();
    const [act1, gapAct, act2] = fixture.componentInstance.acts();

    // The first labelled act is the prologue: no number.
    expect([act1.numeral(), gapAct.numeral(), act2.numeral()]).toEqual(['', '', 'I']);
    expect(root.activeId()).toBe('one');
    const labels = Array.from(el.querySelectorAll('.index__label')).map((label) => label.textContent?.trim());
    expect(labels).toEqual(['One', 'Two']);
    expect(el.querySelector('.index__item--active .index__label')!.textContent).toContain('One');
  });

  it('counts up with the progress', async () => {
    const { el } = await render();
    // 75% of the way, eased.
    const value = Number(el.querySelector('#counter')!.textContent!.replace(/\D/g, ''));
    expect(value).toBeGreaterThan(750);
    expect(value).toBeLessThan(1000);
    expect(el.querySelector('#counter')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('counts also numbers that appear after the act has been measured', async () => {
    const { fixture, el, refresh } = await render();

    fixture.componentInstance.late.set(true);
    await fixture.whenStable();
    expect(el.querySelector('#late')!.textContent).toBe('200');

    await refresh();
    expect(el.querySelector('#late')!.textContent).toBe('200');
  });

  it('shows every act in its final state when the user prefers reduced motion', async () => {
    reducedMotion = true;
    const { fixture, el, one } = await render();

    expect(el.querySelector('#port')!.classList).toContain('scrolly--static');
    expect(one.classList).toContain('scrolly-act--static');
    expect(one.style.getPropertyValue('--p')).toBe('1.0000');
    expect(el.querySelector('#counter')!.textContent).toBe('1.000');
    // The index still follows the reader.
    expect(fixture.componentInstance.acts()[0].state()).toBe('active');
  });

  it('unpins a pinned act whose content does not fit the screen', async () => {
    const { one, refresh } = await render();
    const content = document.createElement('div');
    content.setAttribute('data-scrolly-fit', '');
    one.append(content);
    // Like the annals: unpinned or frozen, the content wraps and gets taller than in the pinned layout.
    let pinnedHeight = 900;
    Object.defineProperty(content, 'scrollHeight', {
      configurable: true,
      get: () =>
        one.classList.contains('scrolly-act--unpinned') || one.classList.contains('scrolly-act--static')
          ? 1500
          : pinnedHeight,
    });

    await refresh();
    expect(one.classList).toContain('scrolly-act--unpinned');
    expect(one.classList).toContain('scrolly-act--static');
    expect(one.style.getPropertyValue('--p')).toBe('1.0000');

    // The screen changes (landscape to portrait): the pinned layout fits again.
    pinnedHeight = 700;
    await refresh();
    expect(one.classList).not.toContain('scrolly-act--unpinned');
    expect(one.classList).not.toContain('scrolly-act--static');
    expect(one.style.getPropertyValue('--p')).toBe('0.7500');
  });

  it('jumps to an act and moves the focus there', async () => {
    const { el, two } = await render();
    const scrollIntoView = vi.fn();
    two.scrollIntoView = scrollIntoView;

    el.querySelectorAll<HTMLAnchorElement>('.index__item')[1].click();

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(two);
  });
});
