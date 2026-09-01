import { Injectable, signal, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

interface RefreshResponse {
  accessToken: string;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar_url?: string;
  github_id?: string;
  github_login?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private accessToken: string | null = null;
  isAuthenticated = signal<boolean>(false);
  currentUser = signal<UserProfile | null>(null);

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

  /** Fetch current user profile — call this on app init */
  fetchProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>('/auth/me', { withCredentials: true }).pipe(
      tap((user) => this.currentUser.set(user))
    );
  }

  logout() {
    this.http.post('/auth/logout', {}, { withCredentials: true }).subscribe(() => {
      this.setAccessToken(null);
      this.currentUser.set(null);
    });
  }
}