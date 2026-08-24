import { Component, OnInit, Inject, PLATFORM_ID, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit{
  isCallback = false;

  @ViewChild('networkCanvas') networkCanvas!: ElementRef<HTMLCanvasElement>;

  constructor(
    public auth: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const fragment = window.location.hash.replace('#', '');
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');

    if (accessToken) {
      this.isCallback = true;
      this.auth.setAccessToken(accessToken);
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }
}