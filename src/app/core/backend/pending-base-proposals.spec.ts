import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideCocApiTest } from '../../testing/fixtures';
import {
  PENDING_REFRESH_MS,
  PENDING_RETRY_MS,
  PendingBaseProposals,
} from './pending-base-proposals';

const URL = '/api/v1/base-proposals/pending-count';
const ok = (pending: number) => ({
  result: { pending },
  messages: [],
  status: { code: 200, name: 'OK' },
});

describe('PendingBaseProposals', () => {
  let httpMock: HttpTestingController;
  let pending: PendingBaseProposals;

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
    pending = TestBed.inject(PendingBaseProposals);
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
    httpMock.expectOne(URL).flush(ok(5));
    expect(pending.count()).toBe(5);
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
