import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideCocApi } from './core/api/provide-coc-api';
import { authInterceptor } from './core/backend/auth.interceptor';
import { cacheInterceptor } from './core/http/cache.interceptor';
import { AuthService } from './core/backend/auth.service';
import { provideI18n } from './core/i18n/provide-i18n';
import { configureChartTheme } from './shared/charts/chart-theme';

configureChartTheme();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([cacheInterceptor, authInterceptor])),
    // Restores the backend session from the refresh cookie without delaying startup
    // (skipped with mock data, which runs without any backend).
    provideAppInitializer(() => {
      if (!environment.useMockApi) inject(AuthService).restoreSession();
    }),
    provideCharts(withDefaultRegisterables()),
    provideCocApi(environment),
    provideI18n(),
  ],
};
