import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';
import { IconName, MATERIAL_ICONS } from './material-icons';

describe('Icon', () => {
  function render(name: IconName, label?: string) {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', name);
    if (label !== undefined) fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws the bundled SVG of the icon, coloured by the text', () => {
    const el = render('refresh');
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(
      /d="([^"]+)"/.exec(MATERIAL_ICONS.refresh)![1],
    );
    expect(el.getAttribute('data-icon')).toBe('refresh');
    expect(el.classList).toContain('mat-icon');
  });

  it('is decorative without a label', () => {
    const el = render('verified');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  it('is an image with an accessible name when labelled', () => {
    const el = render('verified', 'Verified');
    expect(el.getAttribute('aria-hidden')).toBeNull();
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Verified');
  });

  it('bundles only plain SVG shapes', () => {
    for (const [name, body] of Object.entries(MATERIAL_ICONS)) {
      expect(body, name).toMatch(/^(<(path|circle)\b[^<>]*\/>)+$/);
    }
  });
});
