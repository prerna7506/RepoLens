import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { RepoService, Repo } from '../../services/repo.service';
import { SearchComponent } from '../search/search.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, SidebarComponent, SearchComponent],
  schemas: [
    CUSTOM_ELEMENTS_SCHEMA,
  ], 
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  username = '';
  repos = signal<Repo[]>([]);
  newRepoUrl = '';
  isAdding = false;
  taskStatus = '';
  addError = '';

  // Missing state the template expects
  showConnectSection = false;
  viewMode: 'grid' | 'list' = 'grid';
  stats = {
    totalIndexed: '2.4k',
    queries: '1.2k',
    collaborators: 12
  };

  private pollInterval: any;

  // Dynamic progress tracking
  private statusStartTimes = new Map<string, number>();
  private lastStatuses     = new Map<string, string>();
  private progressSpeed: Record<string, number> = {
    'pending':   0.2,
    'queued':    0.5,
    'cloning':   1.2,
    'parsing':   0.8,
    'embedding': 0.6,
    'completed': 0
  };

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private repoService: RepoService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const token = this.auth.getAccessToken();
    if (token) {
      this.initDashboard();
    } else {
      this.auth.refresh().subscribe({
        next: () => this.initDashboard(),
        error: () => this.router.navigate(['/login'])
      });
    }
  }

  initDashboard() {
    this.http.get<any>('/api/me').subscribe((res) => {
      this.username = res.user.username;
    });
    this.loadRepos();
    this.pollInterval = setInterval(() => this.loadRepos(), 5000);
  }

  loadRepos() {
    this.repoService.getRepos().subscribe({
      next: (res) => {
        this.recordStatusTimes(res.repos);
        this.repos.set(res.repos);
      },
      error: (err) => console.error('Failed to load repos:', err)
    });
  }

  private recordStatusTimes(repos: Repo[]) {
    const now = Date.now();
    for (const r of repos) {
      if (!this.statusStartTimes.has(r.id) || this.lastStatuses.get(r.id) !== r.status) {
        this.statusStartTimes.set(r.id, now);
        this.lastStatuses.set(r.id, r.status);
      }
    }
  }

  addRepo() {
    if (!this.newRepoUrl.trim() || this.isAdding) return;
    this.isAdding = true;
    this.taskStatus = '';
    this.addError = '';

    this.repoService.createRepo(this.newRepoUrl.trim()).subscribe({
      next: (res) => {
        this.newRepoUrl = '';
        this.taskStatus = '⏳ Queued for indexing...';
        this.isAdding = false;
        if (res.repo) {
          this.repos.update(list => [res.repo, ...list]);
        }
        this.loadRepos();
      },
      error: (err) => {
        this.addError = err.error?.error || 'Failed to add repo';
        this.isAdding = false;
      }
    });
  }

  reindex(repoId: string) {
    this.http.post(`/api/repos/${repoId}/reindex`, {}).subscribe({
      next: () => this.loadRepos(),
      error: (err) => console.error('Re-index failed:', err)
    });
  }

  /* ── UI helpers ── */
  toggleConnect() {
    this.showConnectSection = !this.showConnectSection;
  }

  toggleView(mode: 'grid' | 'list') {
    this.viewMode = mode;
  }

  getRepoOwner(url: string): string {
    if (!url) return 'unknown';
    try {
      const u = new URL(url);
      return u.pathname.split('/')[1] || 'unknown';
    } catch {
      const parts = url.split('/');
      return parts[parts.length - 2] || 'unknown';
    }
  }

  getRepoName(url: string): string {
    if (!url) return 'unknown';
    try {
      const u = new URL(url);
      return u.pathname.split('/')[2] || 'unknown';
    } catch {
      const parts = url.split('/');
      return parts[parts.length - 1] || 'unknown';
    }
  }

  getStatusMeta(status: string) {
    const map: Record<string, { cls: string; label: string }> = {
      'pending':   { cls: 'pending',  label: 'Pending' },
      'queued':    { cls: 'queued',   label: 'Queued' },
      'cloning':   { cls: 'indexing', label: 'Cloning...' },
      'parsing':   { cls: 'indexing', label: 'Parsing AST...' },
      'embedding': { cls: 'indexing', label: 'Embedding...' },
      'completed': { cls: 'indexed',  label: 'Indexed' },
    };
    return map[status] || { cls: status, label: status };
  }

  /* ── Progress ── */
  getProgress(status: string): number {
    const map: Record<string, number> = {
      'pending':   5,
      'queued':    15,
      'cloning':   35,
      'parsing':   60,
      'embedding': 85,
      'completed': 100
    };
    return map[status] ?? 10;
  }

  getProgressLabel(status: string): string {
    const map: Record<string, string> = {
      'pending':   'Waiting to start...',
      'queued':    'Queued for processing...',
      'cloning':   'Cloning repository...',
      'parsing':   'Parsing AST...',
      'embedding': 'Generating embeddings...',
    };
    return map[status] ?? status;
  }

  getAnimatedProgress(status: string, repoId: string): number {
    const base = this.getProgress(status);
    if (base >= 100) return 100;

    const started = this.statusStartTimes.get(repoId);
    if (!started) return base;

    const elapsedSec = (Date.now() - started) / 1000;
    const creep = (this.progressSpeed[status] || 0) * elapsedSec;
    const max = base + 15;
    return Math.min(Math.floor(base + creep), max, 99);
  }

  openChat(repoId: string) {
    this.router.navigate(['/chat', repoId]);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }
}