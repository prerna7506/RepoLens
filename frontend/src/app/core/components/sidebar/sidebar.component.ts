import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  navItems = [
    { label: 'Dashboard', route: '/dashboard', active: true },
    { label: 'Repositories', route: '/dashboard' },
    { label: 'Search History', route: '/dashboard' },
    { label: 'Team', route: '/dashboard' },
    { label: 'Settings', route: '/dashboard' },
  ];

  constructor(public auth: AuthService) {}
}