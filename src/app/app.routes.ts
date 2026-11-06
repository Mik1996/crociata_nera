import { Routes } from '@angular/router';

/** Route `title`s are translation keys, resolved by `PageTitleStrategy`. */
export const routes: Routes = [
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
    loadComponent: () =>
      import('./features/players/player-detail-page').then((m) => m.PlayerDetailPage),
  },
  {
    path: 'statistics',
    title: 'nav.statistics',
    loadComponent: () =>
      import('./features/statistics/statistics-page').then((m) => m.StatisticsPage),
  },
  {
    path: '**',
    title: 'nav.notFound',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
