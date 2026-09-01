import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QueryService } from '../../services/query.service';
import { RepoService, Repo } from '../../services/repo.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SearchComponent } from '../search/search.component';
import { AuthService } from '../../services/auth.service';

interface HistoryEntry {
  id: string;
  repoId: string;
  repoName: string;
  question: string;
  answer: string;
  created_at: string;
}

interface RepoFilter {
  id: string;
  name: string;
  color: string;
}

@Component({
  selector: 'app-search-history',
  standalone: true,
  imports: [FormsModule, SidebarComponent, SearchComponent],
  templateUrl: './search-history.component.html',
  styleUrl: './search-history.component.css'
})
export class SearchHistoryComponent implements OnInit {
  allEntries: HistoryEntry[] = [];
  entries: HistoryEntry[] = [];
  repoFilters: RepoFilter[] = [];
  searchTerm = '';
  
  // Split into two independent filters
  activeRepoFilter = 'all';   // 'all' | repoId
  last7Only = false;          // true | false
  loading = true;
  errorMsg = '';

  private readonly palette = ['#22d3ee', '#a3e635', '#fb7185', '#facc15', '#7c6cf6', '#38bdf8'];

  constructor(
    private queryService: QueryService,
    private repoService: RepoService,
    private auth: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.load();
  }

  private load() {
    this.loading = true;
    this.errorMsg = '';

    this.repoService.getRepos().subscribe({
      next: (res) => {
        const repos: Repo[] = res.repos || [];
        this.repoFilters = repos.map((r, i) => ({
          id: r.id,
          name: this.shortName(r.github_url),
          color: this.palette[i % this.palette.length]
        }));

        this.queryService.getAllHistory().subscribe({
          next: (histRes: { queries: any[] }) => {
            const repoNameMap = new Map(this.repoFilters.map((r) => [r.id, r.name]));
            this.allEntries = (histRes.queries || []).map((q) => ({
              id: q.id,
              repoId: q.repo_id,
              repoName: repoNameMap.get(q.repo_id) || 'unknown',
              question: q.question,
              answer: q.answer,
              created_at: q.created_at
            }));
            this.applyFilters();
            this.loading = false;
          },
          error: () => {
            this.errorMsg = 'Failed to load search history.';
            this.loading = false;
          }
        });
      },
      error: () => {
        this.errorMsg = 'Failed to load repositories.';
        this.loading = false;
      }
    });
  }

  setRepoFilter(filter: string) {
    this.activeRepoFilter = filter;
    this.applyFilters();
  }

  toggleLast7() {
    this.last7Only = !this.last7Only;
    this.applyFilters();
  }

  onSearchChange() {
    this.applyFilters();
  }

  private applyFilters() {
    let result = [...this.allEntries];

    // 1. Repo filter (independent)
    if (this.activeRepoFilter !== 'all') {
      result = result.filter((e) => e.repoId === this.activeRepoFilter);
    }

    // 2. Time filter (works ON TOP of repo filter)
    if (this.last7Only) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((e) => new Date(e.created_at).getTime() >= cutoff);
    }

    // 3. Search term
    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (e) =>
          e.question.toLowerCase().includes(term) ||
          e.answer.toLowerCase().includes(term)
      );
    }

    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    this.entries = result;
  }

  repoColor(repoId: string): string {
    return this.repoFilters.find((r) => r.id === repoId)?.color || '#666f89';
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  }

  private shortName(url: string): string {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || url;
    } catch {
      return url;
    }
  }
}