import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { CACHE_DURATION } from '../http/http-cache';
import { BaseProposal, DefenseBase } from './backend-api.types';
import { DefenseBasesService, HttpDefenseBasesService } from './defense-bases.service';

const base: DefenseBase = {
  id: 'b1',
  townHallLevel: 18,
  layoutUrl: 'https://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AHV%3AAAAAFQAAAALR',
  description: '',
  clanCastleTroops: [],
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
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: false }),
      ],
    });
    service = TestBed.inject(DefenseBasesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('is the implementation used with the backend', () => {
    expect(service).toBeInstanceOf(HttpDefenseBasesService);
  });

  it('lists the bases page by page, optionally of one town hall', async () => {
    const first = firstValueFrom(service.list(null));
    httpMock
      .expectOne('/api/v1/bases')
      .flush(ok({ items: [base], nextCursor: 'c1', townHallLevels: [18] }));
    expect(await first).toEqual({ items: [base], nextCursor: 'c1', townHallLevels: [18] });

    const next = firstValueFrom(service.list(17, 'c1'));
    httpMock
      .expectOne('/api/v1/bases?th=17&cursor=c1')
      .flush(ok({ items: [], nextCursor: null, townHallLevels: [18] }));
    expect((await next).nextCursor).toBeNull();
  });

  it('leaves the pages out of the HTTP cache (BaseArsenal keeps them)', async () => {
    const page = firstValueFrom(service.list(null));
    const request = httpMock.expectOne('/api/v1/bases');
    expect(request.request.context.get(CACHE_DURATION)).toBe(0);
    request.flush(ok({ items: [], nextCursor: null, townHallLevels: [] }));
    await page;
  });

  it('sends new and changed bases as multipart forms', async () => {
    const image = new Blob(['x'], { type: 'image/webp' });
    const created = firstValueFrom(
      service.create({ layoutUrl: base.layoutUrl, description: 'Notes', image }),
    );
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

  describe('proposals', () => {
    const proposal: BaseProposal = {
      ...base,
      status: 'PENDING',
      submittedAt: '2026-11-12T10:00:00Z',
      author: { id: 'u', username: 'Knight' },
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
    };

    it("proposes, lists, changes and withdraws the member's proposals", async () => {
      const image = new Blob(['x']);
      const sent = firstValueFrom(service.propose({ layoutUrl: base.layoutUrl, image }));
      const post = httpMock.expectOne('/api/v1/base-proposals');
      expect(post.request.method).toBe('POST');
      expect((post.request.body as FormData).get('layoutUrl')).toBe(base.layoutUrl);
      post.flush(ok(proposal));
      expect(await sent).toEqual(proposal);

      const mine = firstValueFrom(service.myProposals());
      httpMock.expectOne('/api/v1/base-proposals/mine').flush(ok([proposal]));
      expect(await mine).toEqual([proposal]);

      const changed = firstValueFrom(service.updateProposal('b1', { description: 'x' }));
      const patch = httpMock.expectOne('/api/v1/base-proposals/b1');
      expect(patch.request.method).toBe('PATCH');
      patch.flush(ok(proposal));
      await changed;

      const withdrawn = firstValueFrom(service.withdrawProposal('b1'));
      const del = httpMock.expectOne('/api/v1/base-proposals/b1');
      expect(del.request.method).toBe('DELETE');
      del.flush(ok(null));
      await withdrawn;
    });

    it('lists, approves and rejects proposals for the moderation', async () => {
      const listed = firstValueFrom(service.proposals('REJECTED'));
      httpMock
        .expectOne('/api/v1/base-proposals?status=REJECTED')
        .flush(ok({ items: [], counts: { PENDING: 1, APPROVED: 0, REJECTED: 0 } }));
      expect((await listed).counts.PENDING).toBe(1);

      const approved = firstValueFrom(service.approve('b1'));
      const approve = httpMock.expectOne('/api/v1/base-proposals/b1/approve');
      expect(approve.request.method).toBe('POST');
      approve.flush(ok({ ...proposal, status: 'APPROVED' }));
      expect((await approved).status).toBe('APPROVED');

      const rejected = firstValueFrom(service.reject('b1', 'No'));
      const reject = httpMock.expectOne('/api/v1/base-proposals/b1/reject');
      expect(reject.request.body).toEqual({ reason: 'No' });
      reject.flush(ok({ ...proposal, status: 'REJECTED', rejectionReason: 'No' }));
      expect((await rejected).rejectionReason).toBe('No');
    });
  });
});
