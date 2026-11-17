import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Tag, TagAppearance, TagSize, TagTone } from './tag';

@Component({
  imports: [Tag],
  template: `<crn-tag class="extra" [tone]="tone()" [appearance]="appearance()" [size]="size()"
    >Nuovo</crn-tag
  >`,
})
class Host {
  tone = signal<TagTone>('neutral');
  appearance = signal<TagAppearance>('outline');
  size = signal<TagSize>('s');
}

describe('Tag', () => {
  async function create() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, tag: fixture.nativeElement.querySelector('crn-tag') as HTMLElement };
  }

  it('shows the projected text with the default look', async () => {
    const { tag } = await create();
    expect(tag.textContent!.trim()).toBe('Nuovo');
    expect([...tag.classList]).toEqual(
      expect.arrayContaining(['extra', 'tag', 'tag--neutral', 'tag--outline', 'tag--s']),
    );
  });

  it('follows tone, appearance and size', async () => {
    const { fixture, tag } = await create();
    fixture.componentInstance.tone.set('danger');
    fixture.componentInstance.appearance.set('solid');
    fixture.componentInstance.size.set('m');
    await fixture.whenStable();
    expect(tag.classList).toContain('tag--danger');
    expect(tag.classList).toContain('tag--solid');
    expect(tag.classList).toContain('tag--m');
    expect(tag.classList).not.toContain('tag--neutral');
    expect(tag.classList).toContain('extra');
  });
});
