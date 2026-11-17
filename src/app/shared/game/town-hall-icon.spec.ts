import { TestBed } from '@angular/core/testing';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { TownHallIcon } from './town-hall-icon';

describe('TownHallIcon', () => {
  it('shows the town hall picture with "Town Hall N" as tooltip and alt text', async () => {
    const fixture = TestBed.createComponent(TownHallIcon);
    fixture.componentRef.setInput('level', 17);
    await fixture.whenStable();

    const img = fixture.debugElement.query(By.css('img.town-hall'));
    expect(img.attributes['src']).toBe('game/town-halls/th-17.webp');
    expect(img.attributes['alt']).toBe('Municipio 17');
    expect(img.injector.get(MatTooltip).message).toBe('Municipio 17');
  });
});
