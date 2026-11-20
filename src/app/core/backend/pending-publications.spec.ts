import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideCocApiTest } from '../../testing/fixtures';
import { PENDING_REFRESH_MS, PENDING_RETRY_MS, PendingPublications } from './pending-publications';

const URL = '/api/v1/admin/publishing/pending-count';
const ok = (bases: number, announcements = 0) => ({
  result: { bases, announcements },
  messages: [],
  status: { code: 200, name: 'OK' },
});

describe('PendingPublications', () => {
  let httpMock: HttpTestingController;
  let pending: PendingPublications;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: false }),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    pending = TestBed.inject(PendingPublications);
  });

  afterEach(() => {
    pending.stop();
    httpMock.verify();
    vi.useRealTimers();
  });

  it('reads the count at once, then every minute', () => {
    pending.start();
    httpMock.expectOne(URL).flush(ok(2));
    expect(pending.count()).toBe(2);

    vi.advanceTimersByTime(PENDING_REFRESH_MS - 1);
    httpMock.expectNone(URL);
    vi.advanceTimersByTime(1);
    httpMock.expectOne(URL).flush(ok(5, 2));
    expect(pending.count()).toBe(7);
    expect(pending.counts()).toEqual({ bases: 5, announcements: 2 });
  });

  it('tries again soon after a failed read, keeping the last count', () => {
    pending.start();
    httpMock.expectOne(URL).flush(ok(3));
    vi.advanceTimersByTime(PENDING_REFRESH_MS);
    httpMock.expectOne(URL).flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(pending.count()).toBe(3);
    vi.advanceTimersByTime(PENDING_RETRY_MS);
    httpMock.expectOne(URL).flush(ok(1));
    expect(pending.count()).toBe(1);
  });

  it('reads again when the page comes back to the foreground', () => {
    pending.start();
    httpMock.expectOne(URL).flush(ok(1));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    httpMock.expectOne(URL).flush(ok(4));
    expect(pending.count()).toBe(4);
  });

  it('takes the part of a tab that read its list', () => {
    pending.start();
    httpMock.expectOne(URL).flush(ok(2, 1));
    pending.set('announcements', 4);
    expect(pending.counts()).toEqual({ bases: 2, announcements: 4 });
    expect(pending.count()).toBe(6);
  });

  it('stops reading and forgets the count at sign-out', () => {
    pending.start();
    httpMock.expectOne(URL).flush(ok(2));
    pending.stop();
    expect(pending.count()).toBe(0);
    vi.advanceTimersByTime(PENDING_REFRESH_MS * 3);
    pending.refresh();
    document.dispatchEvent(new Event('visibilitychange'));
    httpMock.expectNone(URL);
  });
});
