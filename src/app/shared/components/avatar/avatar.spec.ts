import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

describe('Avatar', () => {
  function render(name: string, letters?: number) {
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('name', name);
    if (letters) fixture.componentRef.setInput('letters', letters);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the initial of the name, hidden from assistive technologies', () => {
    const el = render('michele');
    expect(el.textContent!.trim()).toBe('M');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.classList).toContain('avatar--s');
  });

  it('shows more initials when asked', () => {
    expect(render('Crociata Nera', 2).textContent!.trim()).toBe('CN');
  });
});
