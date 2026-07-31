import { Injectable, signal, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

interface RefreshResponse {
  accessToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private accessToken: string | null = null;
  isAuthenticated = signal<boolean>(false);

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  setAccessToken(token: string | null) {
    this.accessToken = token;
    this.isAuthenticated.set(!!token);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  loginWithGithub() {
    if (isPlatformBrowser(this.platformId)) {
      window.location.href = '/auth/github';
    }
  }

  refresh(): Observable<RefreshResponse> {
    return this.http
      .post<RefreshResponse>('/auth/refresh', {}, { withCredentials: true })
      .pipe(tap((res) => this.setAccessToken(res.accessToken)));
  }

  logout() {
    this.http.post('/auth/logout', {}, { withCredentials: true }).subscribe(() => {
      this.setAccessToken(null);
    });
  }
}