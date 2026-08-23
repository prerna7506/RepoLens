import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { RepoService, Repo } from '../../services/repo.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  username = '';
  repos: Repo[] = [];
  newRepoUrl = '';
  isAdding = false;
  taskStatus = '';
  private pollInterval: any;

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private repoService: RepoService,
    private router: Router,
    private cdr: ChangeDetectorRef,  // ✅ Force change detection
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      console.log('SSR - skipping init');
      return;
    }

    console.log('Dashboard init, token exists?', !!this.auth.getAccessToken());
    
    // Small delay to ensure auth interceptor is ready
    setTimeout(() => {
      const token = this.auth.getAccessToken();
      if (token) {
        this.initDashboard();
      } else {
        console.log('No token, trying refresh...');
        this.auth.refresh().subscribe({
          next: () => {
            console.log('Refresh success');
            this.initDashboard();
          },
          error: (err) => {
            console.error('Refresh failed:', err);
            this.router.navigate(['/login']);
          }
        });
      }
    }, 100);
  }

  initDashboard() {
    this.http.get<any>('/api/me').subscribe({
      next: (res) => {
        this.username = res.user?.username || 'User';
        console.log('User loaded:', this.username);
      },
      error: (err) => console.error('Failed to load user:', err)
    });
    
    // Load repos immediately AND start polling
    this.loadRepos();
    this.startPolling();
  }

  startPolling() {
    this.stopPolling();
    console.log('Starting repo polling');
    this.pollInterval = setInterval(() => {
      this.loadRepos();
    }, 5000);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('Polling stopped');
    }
  }

  loadRepos() {
    console.log('Loading repos...');
    this.repoService.getRepos().subscribe({
      next: (res) => {
        const newRepos = res.repos || [];
        console.log('Repos loaded:', newRepos.length, newRepos);
        
        this.repos = newRepos;
        this.cdr.detectChanges(); // ✅ Force UI update
        
        // Only stop polling if no pending repos AND not currently adding
        const hasPending = this.repos.some(r => 
          r.status === 'pending' || r.status === 'indexing' || r.status === 'cloning'
        );
        
        if (!hasPending && !this.isAdding && this.pollInterval) {
          console.log('All repos complete, stopping poll');
          this.stopPolling();
        }
      },
      error: (err) => {
        console.error('Failed to load repos:', err);
        // Don't clear repos on error - keep whatever we have
      }
    });
  }

  addRepo() {
  if (!this.newRepoUrl.trim() || this.isAdding) return;
  
  const url = this.newRepoUrl.trim();
  this.isAdding = true;
  this.taskStatus = 'Queuing...';

  this.repoService.createRepo(url).subscribe({
    next: (res) => {
      this.newRepoUrl = '';
      this.taskStatus = 'Cloning and indexing...';
      
      // ✅ res.repo always exists per your service type
      this.repos = [res.repo, ...this.repos];
      
      this.startPolling();
      this.pollTask(res.task_id);
    },
    error: (err) => {
      this.taskStatus = err.error?.error || 'Failed to add repo';
      this.isAdding = false;
    }
  });
}

  pollTask(taskId: string) {
    console.log('Polling task:', taskId);
    const interval = setInterval(() => {
      this.repoService.getTaskStatus(taskId).subscribe({
        next: (res) => {
          this.taskStatus = `Status: ${res.state}`;
          if (res.state === 'SUCCESS' || res.state === 'FAILURE') {
            clearInterval(interval);
            this.isAdding = false;
            this.taskStatus = res.state === 'SUCCESS'
              ? 'Indexed successfully!'
              : 'Indexing failed';
            console.log('Task complete:', res.state);
            this.loadRepos();
          }
        },
        error: (err) => {
          console.error('Task poll error:', err);
          clearInterval(interval);
          this.isAdding = false;
        }
      });
    }, 3000);
  }

  openChat(repoId: string) {
    this.router.navigate(['/chat', repoId]);
  }

  ngOnDestroy() {
    this.stopPolling();
  }
}