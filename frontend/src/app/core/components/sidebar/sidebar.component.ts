import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  navItems = [
    { label: 'Dashboard', route: '/dashboard' }, 
    { label: 'Repositories', route: '/repositories' },
    { label: 'Search History', route: '/history' },
    { label: 'Settings', route: '/settings' },
  ];

  constructor(public auth: AuthService) {}
}