import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  username = '';
  avatarUrl = '';

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.http.get<any>('/api/me').subscribe((res) => {
      this.username = res.user.username;
    });
  }
}