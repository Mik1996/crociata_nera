import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { PageTitleStrategy } from './page-title-strategy';

@Component({ template: '' })
class Blank {}

describe('PageTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            pathMatch: 'full',
            title: 'nav.welcome',
            data: { seo: 'seo.home' },
            component: Blank,
          },
          { path: 'join', title: 'nav.join', data: { seo: 'seo.join' }, component: Blank },
          { path: 'players', title: 'nav.players', component: Blank },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
  });

  const description = () => TestBed.inject(Meta).getTag('name="description"')?.content;

  it('uses the texts for search engines on the public pages', async () => {
    await TestBed.inject(Router).navigateByUrl('/join');
    expect(TestBed.inject(Title).getTitle()).toBe(
      'Unisciti a Crociata Nera · Clan italiano di Clash of Clans',
    );
    expect(description()).toContain('Cerchiamo giocatori leali');
  });

  it('titles the other pages "<Page> · Crociata Nera", with the home page description', async () => {
    await TestBed.inject(Router).navigateByUrl('/players');
    expect(TestBed.inject(Title).getTitle()).toBe('Giocatori · Crociata Nera');
    expect(description()).toContain('Crociata Nera è un clan italiano');
  });

  it('rewrites both when the language changes', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    TestBed.inject(TranslateService).use('en-US');
    expect(TestBed.inject(Title).getTitle()).toBe('Crociata Nera · Italian Clash of Clans clan');
    expect(description()).toContain('Crociata Nera is an Italian Clash of Clans clan');
    TestBed.inject(TranslateService).use('it-IT');
  });
});
