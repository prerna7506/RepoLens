import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { RepoService, Repo } from '../../services/repo.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SearchComponent } from '../search/search.component';
import { Subject, interval } from 'rxjs';
import { takeUntil, switchMap, catchError, finalize } from 'rxjs/operators';

interface RepoDisplay {
  id: string;
  name: string;
  owner: string;
  github_url: string;
  fileCount: number;
  status: 'ready' | 'indexing' | 'error';
  lastSynced: string;
  updatedAt: string;
  raw: Repo;
}

@Component({
  selector: 'app-repository',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, SearchComponent],
  templateUrl: './repository.component.html',
  styleUrls: ['./repository.component.css'],
})
export class RepositoryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly POLL_INTERVAL = 3000;

  repos: RepoDisplay[] = [];
  filteredRepos: RepoDisplay[] = [];
  searchQuery = '';
  sortBy: 'recent' | 'name' | 'files' = 'recent';
  isLoading = true;
  error: string | null = null;

  constructor(
    private repoService: RepoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadRepos();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRepos() {
  this.isLoading = true;
  this.error = null;

  this.repoService
    .getRepos()
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (res) => {
        console.log('API response:', res);
        this.repos = (res.repos || []).map((r: Repo) => this.toDisplay(r));
        this.applyFilter();
        this.isLoading = false;
        this.cdr.detectChanges();   
        this.startPolling();
      },
      error: (err) => {
        this.error = err.message || 'Failed to load repositories';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
}

  private toDisplay(repo: Repo): RepoDisplay {
    const { owner, name } = this.parseUrl(repo.github_url);
    return {
      id: repo.id,
      name,
      owner,
      github_url: repo.github_url,
      fileCount: repo.file_count || 0,
      status: this.mapStatus(repo.status, repo.task_id),
      lastSynced: this.timeAgo(repo.updated_at || repo.created_at),
      updatedAt: repo.updated_at || repo.created_at || new Date().toISOString(),
      raw: repo,
    };
  }

  private parseUrl(url: string): { owner: string; name: string } {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return { owner: parts[0] || 'unknown', name: parts[1] || 'unknown' };
    } catch {
      return { owner: 'unknown', name: 'unknown' };
    }
  }

  private mapStatus(status: string, taskId: string | null): 'ready' | 'indexing' | 'error' {
    const s = (status || '').toLowerCase();
    if (s === 'ready' || s === 'completed') return 'ready';
    if (s === 'failed' || s === 'error') return 'error';
    if (taskId || s === 'indexing' || s === 'pending' || s === 'processing') return 'indexing';
    return 'ready';
  }

  private timeAgo(dateStr: string): string {
    if (!dateStr || dateStr === 'Invalid Date') return 'Recently';

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Recently';

    const now = new Date();
    const secs = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (secs < 0) return 'Recently';
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  private startPolling() {
    const indexing = this.repos.filter((r) => r.status === 'indexing');
    if (!indexing.length) return;

    interval(this.POLL_INTERVAL)
      .pipe(
        switchMap(() => this.repoService.getRepos()),
        takeUntil(this.destroy$),
      )
      .subscribe((res) => {
        const updated = (res.repos || []).map((r: Repo) => this.toDisplay(r));
        this.repos = this.repos.map((existing) => {
          const found = updated.find((u: RepoDisplay) => u.id === existing.id);
          return found || existing;
        });
        this.applyFilter();
        this.cdr.detectChanges();
      });
  }

  onSearch(query: string) {
    this.searchQuery = query.toLowerCase();
    this.applyFilter();
  }

  setSort(sort: 'recent' | 'name' | 'files') {
    this.sortBy = sort;
    this.applyFilter();
  }

  private applyFilter() {
    let result = [...this.repos];

    if (this.searchQuery) {
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(this.searchQuery) ||
          r.owner.toLowerCase().includes(this.searchQuery),
      );
    }

    switch (this.sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'files':
        result.sort((a, b) => b.fileCount - a.fileCount);
        break;
      default:
        result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
    }

    this.filteredRepos = result;
  }

  trackById(index: number, repo: RepoDisplay) {
    return repo.id;
  }
}
