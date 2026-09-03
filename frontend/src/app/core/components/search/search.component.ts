import { Component, Input } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { UserFlyoutComponent, UserProfile } from '../user-flyout/user-flyout.component';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, UserFlyoutComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css'
})
export class SearchComponent {
  @Input() username = '';
  @Input() activeUsers: { userId: string; username: string; color?: string }[] = [];
  
  userFlyoutOpen = false;
  
  userProfile: UserProfile = {
    name: 'Alex Chen',
    email: 'alex@repolens.ai',
    initials: 'AC',
    role: 'ENTERPRISE ADMIN',
    workspace: 'ACME CORP'
  };

  constructor(public auth: AuthService) {}

  toggleUserFlyout(): void {
    this.userFlyoutOpen = !this.userFlyoutOpen;
  }

  onLogout(): void {
    this.auth.logout();
  }
}