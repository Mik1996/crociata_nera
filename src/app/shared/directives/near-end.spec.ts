import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NearEnd } from './near-end';

@Component({
  imports: [NearEnd],
  template: `<div class="scroller" style="overflow-y: auto">
    <ul></ul>
    <div crnNearEnd></div>
  </div>`,
})
class Host {
  readonly end = viewChild.required(NearEnd);
}

describe('NearEnd', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('watches the marker within the nearest scrolling area, one screen ahead', async () => {
    const observers: {
      root: Element | null;
      rootMargin: string;
      callback: (e: { isIntersecting: boolean }[]) => void;
    }[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(
          callback: (e: { isIntersecting: boolean }[]) => void,
          options: { root: Element | null; rootMargin: string },
        ) {
          observers.push({ ...options, callback });
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const end = fixture.componentInstance.end();

    expect(observers).toHaveLength(1);
    expect(observers[0].root).toBe(fixture.nativeElement.querySelector('.scroller'));
    expect(observers[0].rootMargin).toBe('0% 0% 100% 0%');
    expect(end.visible()).toBe(false);
    observers[0].callback([{ isIntersecting: true }]);
    expect(end.visible()).toBe(true);
    observers[0].callback([{ isIntersecting: false }]);
    expect(end.visible()).toBe(false);

    // Same scrolling area after a resize: the same observer.
    window.dispatchEvent(new Event('resize'));
    expect(observers).toHaveLength(1);

    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it('counts the marker as near without IntersectionObserver (every page is read)', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(fixture.componentInstance.end().visible()).toBe(true);
  });
});
