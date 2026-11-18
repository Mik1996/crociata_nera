import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/backend/auth.service';
import { PlayerCell } from './player-cell';
import { Tag } from '../tag/tag';

@Component({
  imports: [PlayerCell, Tag],
  template: `
    <div (click)="rowClicks = rowClicks + 1">
      <crn-player-cell
        [tag]="tag()"
        name="Michele"
        [link]="link()"
        [showTag]="showTag()"
        [stopPropagation]="stop()"
      >
        <crn-tag class="former">Ex membro</crn-tag>
        <p class="meta">Crociata Nera</p>
      </crn-player-cell>
    </div>
  `,
})
class Host {
  tag = signal('#ME');
  link = signal(true);
  showTag = signal(false);
  stop = signal(false);
  rowClicks = 0;
}

describe('PlayerCell', () => {
  async function create() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'players/:tag', children: [] }]),
        { provide: AuthService, useValue: { isMyPlayer: (tag: string) => tag === '#ME' } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('links the name to the profile and marks the signed-in user', async () => {
    const { el } = await create();
    const link = el.querySelector('a')!;
    expect(link.textContent!.trim()).toBe('Michele');
    expect(link.getAttribute('href')).toBe('/players/%23ME');
    const line = el.querySelector('.player-cell__line')!;
    expect(line.querySelector('crn-tag.tag--me')!.textContent!.trim()).toBe('Tu');
    expect(line.querySelector('crn-tag.former')).not.toBeNull();
    expect(el.querySelector('.player-cell__line .meta')).toBeNull();
    expect(el.querySelector('.meta')).not.toBeNull();
  });

  it('leaves out the "You" tag for other players and the link when asked', async () => {
    const { fixture, el } = await create();
    fixture.componentInstance.tag.set('#OTHER');
    fixture.componentInstance.link.set(false);
    await fixture.whenStable();
    expect(el.querySelector('crn-tag.tag--me')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.player-cell__name')!.textContent).toBe('Michele');
  });

  it('shows the player tag under the name', async () => {
    const { fixture, el } = await create();
    expect(el.querySelector('.player-cell__tag')).toBeNull();
    fixture.componentInstance.showTag.set(true);
    await fixture.whenStable();
    expect(el.querySelector('.player-cell__tag')!.textContent).toBe('#ME');
  });

  it('keeps the click on the name from reaching the row when asked', async () => {
    const { fixture, el } = await create();
    const click = () =>
      el
        .querySelector('a')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    expect(fixture.componentInstance.rowClicks).toBe(1);
    fixture.componentInstance.stop.set(true);
    await fixture.whenStable();
    click();
    expect(fixture.componentInstance.rowClicks).toBe(1);
  });
});
