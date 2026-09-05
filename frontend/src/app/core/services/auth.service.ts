import { Injectable, signal, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
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
  isInitialized = signal<boolean>(false);

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  async init(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.isInitialized.set(true);
      return;
    }

    try {
      const res = await firstValueFrom(
        this.http.post<RefreshResponse>('/auth/refresh', {}, { withCredentials: true })
      );
      this.setAccessToken(res.accessToken);
    } catch {
      this.setAccessToken(null);
    } finally {
      this.isInitialized.set(true);
    }
  }

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

  fetchProfile(): Observable<UserProfile> {
    return this.http
      .get<UserProfile>('/api/me', { withCredentials: true })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  updateProfile(payload: { name: string; username: string; email: string }) {
    return this.http.put<{ user: any }>('/api/users/profile', payload).pipe(
      tap(res => this.currentUser.set(res.user))
    );
  }

  logout(): void {
    this.http.post('/api/auth/logout', {}, { withCredentials: true }).subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout()
    });
  }

  private finishLogout(): void {
    this.currentUser.set(null);
    this.setAccessToken(null);  
    this.router.navigate(['/login']);
  }
}