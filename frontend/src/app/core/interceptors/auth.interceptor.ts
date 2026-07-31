import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let refreshInFlight: ReturnType<AuthService['refresh']> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getAccessToken();

  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthRoute = req.url.includes('/auth/');
      if (err.status !== 401 || isAuthRoute) {
        return throwError(() => err);
      }

      if (!refreshInFlight) {
        refreshInFlight = auth.refresh();
      }

      return refreshInFlight.pipe(
        switchMap((res) => {
          refreshInFlight = null;
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${res.accessToken}` }
          });
          return next(retried);
        }),
        catchError((refreshErr) => {
          refreshInFlight = null;
          auth.setAccessToken(null);
          return throwError(() => refreshErr);
        })
      );
    })
  );
};