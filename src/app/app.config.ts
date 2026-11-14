import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withNavigationErrorHandler,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideCocApi } from './core/api/provide-coc-api';
import { authInterceptor } from './core/backend/auth.interceptor';
import { cacheInterceptor } from './core/http/cache.interceptor';
import { AuthService } from './core/backend/auth.service';
import { provideI18n } from './core/i18n/provide-i18n';
import { AppUpdates } from './core/pwa/app-updates';
import { reloadOnChunkLoadError } from './core/pwa/chunk-load-error';
import { configureChartTheme } from './shared/charts/chart-theme';

configureChartTheme();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      withNavigationErrorHandler((error) => reloadOnChunkLoadError(error)),
    ),
    provideHttpClient(withFetch(), withInterceptors([cacheInterceptor, authInterceptor])),
    // Restores the backend session from the refresh cookie without delaying startup
    // (skipped with mock data, which runs without any backend).
    provideAppInitializer(() => {
      if (!environment.useMockApi) inject(AuthService).restoreSession();
    }),
    // Offline support and updates (production build only: `serviceWorker` in angular.json).
    // Registered once the app is idle, so it never competes with the first page load.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => inject(AppUpdates).start()),
    provideCharts(withDefaultRegisterables()),
    provideCocApi(environment),
    provideI18n(),
  ],
};
