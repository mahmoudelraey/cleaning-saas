import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { LanguageService } from './core/i18n/language.service';
import { FieldOpsPreset } from './theme';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTranslateService({
      // useHttpBackend: skip interceptors (they depend on LanguageService → TranslateService = DI cycle).
      loader: provideTranslateHttpLoader({
        prefix: '/i18n/',
        suffix: '.json',
        useHttpBackend: true,
      }),
      fallbackLang: 'ar',
    }),
    providePrimeNG({
      ripple: true,
      theme: {
        preset: FieldOpsPreset,
        options: { darkModeSelector: '.app-dark', cssLayer: false },
      },
    }),
    MessageService,
    ConfirmationService,
    // Load translations and set <html dir> before the first screen renders (no LTR flash).
    provideAppInitializer(() => firstValueFrom(inject(LanguageService).init())),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
