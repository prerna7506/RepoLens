import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, switchMap, throwError, Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

let refreshInFlight: Observable<{ accessToken: string }> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const platformId = inject(PLATFORM_ID);
  const token = auth.getAccessToken();

  const isAuthRoute = req.url.includes('/auth/');
  const authedReq = token && !isAuthRoute
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (!isPlatformBrowser(platformId) || err.status !== 401 || isAuthRoute) {
        return throwError(() => err);
      }

      if (!refreshInFlight) {
        refreshInFlight = auth.refresh().pipe(
          catchError((refreshErr) => {
            refreshInFlight = null;
            auth.setAccessToken(null);
            return throwError(() => refreshErr);
          })
        );
      }

      return refreshInFlight.pipe(
        switchMap((res) => {
          refreshInFlight = null;
          auth.setAccessToken(res.accessToken);
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${res.accessToken}` }
          });
          return next(retried);
        })
      );
    })
  );
};