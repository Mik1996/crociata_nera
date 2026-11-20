import { HttpTestingController } from '@angular/common/http/testing';
import { ok, renderPublishingPage, status, STATUS_URL } from '../publishing-testing';

describe('BasePosts', () => {
  let httpMock: HttpTestingController;

  async function render(initial = status) {
    const rendered = await renderPublishingPage(undefined, initial);
    httpMock = rendered.httpMock;
    return rendered;
  }

  afterEach(() => httpMock.verify());

  it('shows how the posts stand on the bases tab, without managing the channels', async () => {
    const { el } = await render();
    const bases = el.querySelector('crn-base-posts')!;
    expect(bases.textContent).toContain('12');
    expect(bases.textContent).toContain('Basi TH19 in attesa: 3');
    expect(bases.textContent).toContain('Bad Request: wrong file');
    expect(bases.querySelector('crn-select, mat-slide-toggle')).toBeNull();
  });

  it('retries the failed posts', async () => {
    const { fixture, el } = await render();
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Riprova ora'))!.click();
    httpMock.expectOne(`${STATUS_URL}/sync`).flush(ok(status));
    await fixture.whenStable();
    expect(el.textContent).toContain('Invii avviati');
  });
});
