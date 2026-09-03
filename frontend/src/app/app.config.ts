import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { authInterceptor } from './core/interceptors/auth.interceptor';
import { authGuard } from './core/guards/auth.guard';

const routes: Routes = [
  // Landing page (root)
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./core/components/landing/landing.component').then((m) => m.LandingComponent)
  },

  {
    path: 'login',
    loadComponent: () =>
      import('./core/components/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./core/components/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/components/dashboard/dashboard.component').then((m) => m.DashboardComponent)
  },
  {
    path: 'chat/:repoId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/components/chat/chat.component').then((m) => m.ChatComponent)
  },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/components/search-history/search-history.component').then((m) => m.SearchHistoryComponent)
  },
  {
    path: 'settings',
    canActivate: [authGuard],        
    loadComponent: () =>
      import('./core/components/setting/setting.component').then((m) => m.SettingsComponent)
  },
  { path: '**', redirectTo: '' }
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor])
    )
  ]
};