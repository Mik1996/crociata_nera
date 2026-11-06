import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/backend/auth.guards';

/**
 * Route `title`s are translation keys, resolved by `PageTitleStrategy`.
 *
 * Only sign-in and sign-up are public. Every other page (including the 404) lives under a
 * group protected by `authGuard`: signed-out users are sent to sign-in and come back afterwards.
 */
export const routes: Routes = [
  {
    path: 'sign-in',
    title: 'nav.signIn',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/sign-in-page').then((m) => m.SignInPage),
  },
  {
    path: 'sign-up',
    title: 'nav.signUp',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/sign-up-page').then((m) => m.SignUpPage),
  },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'nav.dashboard',
        loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'current-war',
        title: 'nav.currentWar',
        loadComponent: () => import('./features/wars/current-war-page').then((m) => m.CurrentWarPage),
      },
      {
        path: 'wars',
        title: 'nav.history',
        loadComponent: () => import('./features/wars/war-history-page').then((m) => m.WarHistoryPage),
      },
      {
        path: 'wars/:id',
        title: 'nav.warDetail',
        loadComponent: () => import('./features/wars/war-detail-page').then((m) => m.WarDetailPage),
      },
      {
        path: 'players',
        title: 'nav.players',
        loadComponent: () => import('./features/players/players-page').then((m) => m.PlayersPage),
      },
      {
        path: 'players/:tag',
        title: 'nav.player',
        loadComponent: () => import('./features/players/player-detail-page').then((m) => m.PlayerDetailPage),
      },
      {
        path: 'statistics',
        title: 'nav.statistics',
        loadComponent: () => import('./features/statistics/statistics-page').then((m) => m.StatisticsPage),
      },
      {
        path: '**',
        title: 'nav.notFound',
        loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
