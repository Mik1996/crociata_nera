import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { DefenseBase } from './backend-api.types';
import { DefenseBasesService, HttpDefenseBasesService } from './defense-bases.service';

const base: DefenseBase = {
  id: 'b1',
  townHallLevel: 18,
  layoutUrl: 'https://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALR',
  description: '',
  image: { key: 'Key_123', width: 1400, height: 900 },
  createdAt: '2026-11-12T10:00:00Z',
  updatedAt: '2026-11-12T10:00:00Z',
};
const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'OK' } });

describe('HttpDefenseBasesService', () => {
  let service: DefenseBasesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: false })],
    });
    service = TestBed.inject(DefenseBasesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('is the implementation used with the backend', () => {
    expect(service).toBeInstanceOf(HttpDefenseBasesService);
  });

  it('lists the bases, optionally of one town hall', async () => {
    const all = firstValueFrom(service.list(null));
    httpMock.expectOne('/api/v1/bases').flush(ok({ items: [base], townHallLevels: [18] }));
    expect((await all).items).toEqual([base]);

    const th17 = firstValueFrom(service.list(17));
    httpMock.expectOne('/api/v1/bases?th=17').flush(ok({ items: [], townHallLevels: [18] }));
    expect((await th17).items).toEqual([]);
  });

  it('sends new and changed bases as multipart forms', async () => {
    const image = new Blob(['x'], { type: 'image/webp' });
    const created = firstValueFrom(service.create({ layoutUrl: base.layoutUrl, description: 'Notes', image }));
    const post = httpMock.expectOne('/api/v1/bases');
    expect(post.request.method).toBe('POST');
    const body = post.request.body as FormData;
    expect(body.get('layoutUrl')).toBe(base.layoutUrl);
    expect(body.get('description')).toBe('Notes');
    expect(body.get('image')).toBeInstanceOf(Blob);
    post.flush(ok(base));
    expect(await created).toEqual(base);

    const updated = firstValueFrom(service.update('b1', { description: '' }));
    const patch = httpMock.expectOne('/api/v1/bases/b1');
    expect(patch.request.method).toBe('PATCH');
    const changes = patch.request.body as FormData;
    expect([...changes.keys()]).toEqual(['description']);
    patch.flush(ok(base));
    await updated;
  });

  it('deletes a base and builds the image URLs', async () => {
    const removed = firstValueFrom(service.remove('b1'));
    const del = httpMock.expectOne('/api/v1/bases/b1');
    expect(del.request.method).toBe('DELETE');
    del.flush(ok(null));
    await removed;

    expect(service.imageUrl(base, 'thumb')).toBe('/api/v1/base-images/Key_123/thumb');
    expect(service.imageUrl(base, 'full')).toBe('/api/v1/base-images/Key_123/full');
  });
});
