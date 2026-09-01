import { Component, Input } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css'
})
export class SearchComponent {
  @Input() username = '';
  @Input() activeUsers: { userId: string; username: string; color?: string }[] = [];
  constructor(public auth: AuthService) {}
}