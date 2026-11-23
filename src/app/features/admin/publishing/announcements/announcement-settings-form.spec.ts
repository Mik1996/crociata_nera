import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { AnnouncementSettings } from '../../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../../testing/fixtures';
import { AnnouncementSettingsForm } from './announcement-settings-form';

const SETTINGS_URL = '/api/v1/admin/announcements/settings';

const settings: AnnouncementSettings = {
  kinds: [
    { kind: 'month', enabled: true },
    { kind: 'war', enabled: false },
    { kind: 'raid', enabled: true },
  ],
};
const ok = <T>(result: T, messages: unknown[] = []) => ({
  result,
  messages,
  status: { code: 200, name: 'HTTP_STATUS.OK' },
});

describe('AnnouncementSettingsForm', () => {
  let httpMock: HttpTestingController;

  async function render() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AnnouncementSettingsForm);
    fixture.detectChanges();
    httpMock.expectOne(SETTINGS_URL).flush(ok(settings));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const toggles = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.kind__toggle button[role="switch"]'));
  const saveButton = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  afterEach(() => httpMock.verify());

  it('shows a switch for each kind, on or off as saved', async () => {
    const { el } = await render();
    const names = Array.from(el.querySelectorAll('.kind__name')).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Mese', 'Guerra', 'Raid Weekend']);
    expect(toggles(el).map((t) => t.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'true',
    ]);
    expect(el.querySelector('.kind__when')!.textContent).toContain('Si chiude un mese');
    expect(saveButton(el).disabled).toBe(true);
  });

  it('names and describes each switch with its kind, on the focusable switch itself', async () => {
    const { el } = await render();
    // The references must reach the button screen readers focus, not stay on <mat-slide-toggle>.
    for (const toggle of toggles(el)) {
      const name = el.querySelector(`[id="${toggle.getAttribute('aria-labelledby')}"]`);
      const when = el.querySelector(`[id="${toggle.getAttribute('aria-describedby')}"]`);
      expect(name?.classList).toContain('kind__name');
      expect(when?.classList).toContain('kind__when');
    }
    expect(toggles(el).map((t) => t.getAttribute('aria-labelledby'))).toEqual([
      'draft-kind-month',
      'draft-kind-war',
      'draft-kind-raid',
    ]);
  });

  it('saves only the kinds changed', async () => {
    const { fixture, el } = await render();
    toggles(el)[1]!.click();
    toggles(el)[2]!.click();
    await fixture.whenStable();
    expect(saveButton(el).disabled).toBe(false);

    saveButton(el).click();
    const req = httpMock.expectOne(SETTINGS_URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      kinds: [
        { kind: 'war', enabled: true },
        { kind: 'raid', enabled: false },
      ],
    });
    req.flush(
      ok(
        {
          kinds: [
            { kind: 'month', enabled: true },
            { kind: 'war', enabled: true },
            { kind: 'raid', enabled: false },
          ],
        },
        [{ key: 'SUCCESS.ANNOUNCEMENT_SETTINGS_UPDATED' }],
      ),
    );
    await fixture.whenStable();
    expect(el.querySelector('crn-alert')!.textContent).toContain('Impostazioni delle bozze salvate');
    expect(toggles(el).map((t) => t.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'false',
    ]);
    expect(saveButton(el).disabled).toBe(true);
  });

  it('goes back to the saved settings', async () => {
    const { fixture, el } = await render();
    toggles(el)[0]!.click();
    await fixture.whenStable();
    expect(toggles(el)[0]!.getAttribute('aria-checked')).toBe('false');

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Annulla modifiche'))!
      .click();
    await fixture.whenStable();
    expect(toggles(el)[0]!.getAttribute('aria-checked')).toBe('true');
    expect(saveButton(el).disabled).toBe(true);
  });
});
