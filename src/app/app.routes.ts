import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/backend/auth.guards';

/**
 * Route `title`s are translation keys, resolved by `PageTitleStrategy`.
 *
 * Public pages: the welcome page (home), sign-in and sign-up. Every other page (including
 * the 404) lives under a group protected by `authGuard`: signed-out users are sent to the
 * welcome page, from which "Sign in" brings them back to the page they asked for.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'nav.welcome',
    loadComponent: () => import('./features/welcome/welcome-page').then((m) => m.WelcomePage),
  },
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
    path: 'forgot-password',
    title: 'nav.forgotPassword',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
  },
  {
    // Public: the link arrives by email, signed in or not.
    path: 'reset-password',
    title: 'nav.resetPassword',
    loadComponent: () => import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'verify-email',
    title: 'nav.verifyEmail',
    loadComponent: () => import('./features/auth/verify-email-page').then((m) => m.VerifyEmailPage),
  },
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
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
        path: 'profile',
        title: 'nav.profile',
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'admin',
        title: 'nav.admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
      },
      {
        path: '**',
        title: 'nav.notFound',
        loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
