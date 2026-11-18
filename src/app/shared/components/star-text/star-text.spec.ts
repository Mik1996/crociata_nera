import { TestBed } from '@angular/core/testing';
import { StarText } from './star-text';

describe('StarText', () => {
  function render(text: string): HTMLElement {
    const fixture = TestBed.createComponent(StarText);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('replaces every star with the in-game picture', () => {
    const el = render('3★·2★ %');
    const stars = Array.from(el.querySelectorAll('img'));
    expect(stars.map((img) => img.getAttribute('src'))).toEqual(['game/misc/star.webp', 'game/misc/star.webp']);
    expect(el.textContent).toBe('3·2 %');
  });

  it('leaves text without stars as it is', () => {
    const el = render('Media');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent!.trim()).toBe('Media');
  });
});
