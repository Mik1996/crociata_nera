import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { TelegramChat, TelegramStatus } from '../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../testing/fixtures';
import { PublishingPage } from './publishing-page';

/** Test data and set-up shared by the specs of the Publications page and its tabs. */
export const STATUS_URL = '/api/v1/admin/telegram';
export const ANNOUNCEMENTS_URL = '/api/v1/admin/announcements';

export const th18: TelegramChat = {
  chatId: -1001800,
  title: 'Arsenale basi TH18',
  username: 'basi18',
  type: 'channel',
  botStatus: 'administrator',
  canPost: true,
  purpose: 'bases',
  townHallLevel: 18,
  locked: false,
  updatedAt: '2026-11-19T10:00:00Z',
};
export const th19: TelegramChat = {
  ...th18,
  chatId: -1001900,
  title: 'Arsenale basi TH19',
  username: null,
  canPost: false,
  townHallLevel: null,
};
export const news: TelegramChat = {
  ...th18,
  chatId: -1002000,
  title: 'Crociata annunci',
  username: 'crociata_annunci',
  purpose: 'announcements',
  townHallLevel: null,
};
export const status: TelegramStatus = {
  configured: true,
  botUsername: 'CrociataNeraBot',
  updates: 'webhook',
  chats: [th18, th19, news],
  basePosts: {
    sent: 12,
    waiting: [{ townHallLevel: 19, bases: 3 }],
    failed: [{ baseId: 'b1', townHallLevel: 18, error: 'Bad Request: wrong file', retryAt: null }],
    pending: 0,
  },
};
export const ok = <T>(result: T, messages: unknown[] = []) => ({
  result,
  messages,
  status: { code: 200, name: 'HTTP_STATUS.OK' },
});

/**
 * Renders the Publications page on a tab, answering the status of the bot (and the announcements,
 * empty, and their settings on their tab; the proposals come from the mock data).
 */
export async function renderPublishingPage(tab?: string, initial: TelegramStatus = status) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideCocApiTest({ useMockApi: true }),
      { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(PublishingPage);
  if (tab) fixture.componentRef.setInput('tab', tab);
  fixture.detectChanges();
  httpMock.expectOne(STATUS_URL).flush(ok(initial));
  httpMock.match((r) => r.url === ANNOUNCEMENTS_URL).forEach((r) => r.flush(ok([])));
  httpMock
    .match((r) => r.url === `${ANNOUNCEMENTS_URL}/settings`)
    .forEach((r) => r.flush(ok({ kinds: [{ kind: 'month', enabled: true }] })));
  await fixture.whenStable();
  return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
}
