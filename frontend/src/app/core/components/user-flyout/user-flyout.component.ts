import { Component, Input, Output, EventEmitter, HostListener, ElementRef, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService, UserProfile as AuthUserProfile } from '../../services/auth.service'; // adjust path to match your actual location

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  initials?: string;
  role?: string;
  workspace?: string;
}

@Component({
  selector: 'app-user-flyout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-flyout.component.html',
  styleUrl: './user-flyout.component.css'
})
export class UserFlyoutComponent {
  private elementRef = inject(ElementRef);
  private router = inject(Router);
  private authService = inject(AuthService);

  // Optional override — if not passed in, falls back to AuthService.currentUser signal.
  @Input() user?: UserProfile;
  @Input() isOpen = false;
  @Output() isOpenChange = new EventEmitter<boolean>();
  @Output() logout = new EventEmitter<void>();

  // Single source of truth: AuthService.currentUser, with @Input as an optional override.
  // Returns null (not undefined) while the profile hasn't loaded yet — the template
  // guards on this with @if so nothing tries to read properties off an empty value.
  currentUser = computed<UserProfile | null>(() => {
    if (this.user) return this.user;
    const u: AuthUserProfile | null = this.authService.currentUser();
    if (!u) return null;
    // GitHub users often have no public "name" set — fall back to username/login.
    const displayName = u.name || u.username || u.github_login || 'User';
    return {
      name: displayName,
      email: u.email || '',
      avatar: u.avatar_url,
      initials: this.getInitials(displayName)
    };
  });

  menuItems = [
    { id: 'account', label: 'Account Settings', icon: this.settingsIcon(), route: '/settings' },
  ];

  private getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside && this.isOpen) {
      this.close();
    }
  }

  close(): void {
    this.isOpen = false;
    this.isOpenChange.emit(false);
  }

  onMenuClick(route: string): void {
    this.close();
    this.router.navigate([route]);
  }

  onLogout(): void {
    this.authService.logout();
    this.logout.emit();
    this.close();
  }

  private settingsIcon(): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
}