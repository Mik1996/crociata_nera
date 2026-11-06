import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { CocApiService } from './coc-api';
import { HttpCocApiService } from './http-coc-api.service';
import { MockCocApiService } from './mock-coc-api.service';

/** Registers the configuration and the data layer implementation (mock or HTTP). */
export function provideCocApi(config: AppConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: APP_CONFIG, useValue: config },
    { provide: CocApiService, useClass: config.useMockApi ? MockCocApiService : HttpCocApiService },
  ]);
}
