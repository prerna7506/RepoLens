import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RepoService } from '../../services/repo.service';
import { QueryService } from '../../services/query.service';
import { FileTreeComponent } from '../file-tree/file-tree.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SearchComponent } from '../search/search.component';
import { Router } from '@angular/router';

interface ActiveUser {
  userId: string;
  username: string;
  currentFile?: string;
}

interface OpenTab {
  path: string;
  name: string;
  lines: SafeHtml[];
  language: string;
  loading: boolean;
  error?: string;
}

@Component({
  selector: 'app-code-explorer',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FileTreeComponent,
    SidebarComponent,
    SearchComponent
  ],
  templateUrl: './code-explorer.component.html',
  styleUrls: ['./code-explorer.component.css']
})
export class CodeExplorerComponent implements OnInit {
  repoId = '';
  repoName = '';
  repoOwner = '';
  branch = 'main';

  openTabs: OpenTab[] = [];
  activeTabIndex = 0;
  activeTabPath: string | null = null;

  activeUsers: ActiveUser[] = [];

  constructor(
    private route: ActivatedRoute,
    private repoService: RepoService,
    private queryService: QueryService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.repoId = this.route.snapshot.paramMap.get('id') || '';

    // Guard: no access token exists yet during SSR, so this call always 401s.
    // The previous version had no error callback at all — when an observable
    // errors with nothing to catch it, RxJS rethrows it as an uncaught exception,
    // which crashed the Node SSR process on every load.
    if (!isPlatformBrowser(this.platformId)) return;

    this.repoService.getRepos().subscribe({
      next: (res) => {
        const repo = res.repos.find((r: any) => r.id === this.repoId);
        if (repo) {
          const { owner, name } = this.parseUrl(repo.github_url);
          this.repoOwner = owner;
          this.repoName = name;
        }
      },
      error: (err) => {
        console.error('Failed to load repo metadata:', err);
      }
    });
  }

  /* ── File opening ── */

  onFileSelected(path: string) {
    const existingIndex = this.openTabs.findIndex(t => t.path === path);
    if (existingIndex >= 0) {
      this.activeTabIndex = existingIndex;
      this.activeTabPath = path;
      return;
    }

    const tab: OpenTab = {
      path,
      name: path.split('/').pop() || path,
      lines: [],
      language: this.guessLanguage(path),
      loading: true
    };

    this.openTabs.push(tab);
    this.activeTabIndex = this.openTabs.length - 1;
    this.activeTabPath = path;

    // Was this.repoService.getFileContent(...) — that method hits the
    // not-yet-implemented /api/repos/:id/file route. QueryService.getFileContent
    // is the same method chat.component.ts uses successfully.
    this.queryService.getFileContent(this.repoId, path).subscribe({
      next: (res: any) => {
        tab.lines = this.highlightCode(res.content, tab.language);
        tab.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        tab.error = 'Could not load file content.';
        tab.loading = false;
        console.error('getFileContent error:', err);
        this.cdr.detectChanges();
      }
    });
  }

  selectTab(index: number) {
    this.activeTabIndex = index;
    this.activeTabPath = this.openTabs[index]?.path || null;
  }

  closeTab(index: number, event: Event) {
    event.stopPropagation();
    this.openTabs.splice(index, 1);
    if (this.activeTabIndex >= this.openTabs.length) {
      this.activeTabIndex = Math.max(0, this.openTabs.length - 1);
    }
    this.activeTabPath = this.openTabs[this.activeTabIndex]?.path || null;
  }

  /* ── Helpers ── */

  get activeTab(): OpenTab | undefined {
    return this.openTabs[this.activeTabIndex];
  }

  get activeFileViewers(): ActiveUser[] {
    const path = this.activeTab?.path;
    if (!path) return [];
    return this.activeUsers.filter(u => u.currentFile === path);
  }

  fileName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }

  breadcrumb(path: string): string[] {
    return path.split('/').filter(Boolean);
  }

  private parseUrl(url: string) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return { owner: parts[0] || 'unknown', name: parts[1] || 'unknown' };
    } catch {
      return { owner: 'unknown', name: 'unknown' };
    }
  }

  private guessLanguage(path: string): string {
    const ext = path.split('.').pop() || '';
    const map: Record<string, string> = {
      ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
      py: 'Python', json: 'JSON', md: 'Markdown', css: 'CSS', html: 'HTML'
    };
    return map[ext] || 'Plain Text';
  }

  private highlightCode(code: string, language: string): SafeHtml[] {
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const keywords =
      /\b(import|export|const|let|var|function|return|if|else|for|while|new|class|interface|extends|implements|from|as|async|await|try|catch|throw|typeof|in|of|void|this|public|private|protected|readonly|static|yield)\b/g;
    const types =
      /\b(string|number|boolean|any|unknown|void|null|undefined|true|false)\b/g;

    return code.split('\n').map((rawLine) => {
      let line = escapeHtml(rawLine);

      line = line.replace(/(\/\/.*$)/, '<span class="tok-comment">$1</span>');

      line = line.replace(
        /(&#39;|'|")((?:\\.|(?!\1).)*)\1/g,
        (m) => `<span class="tok-string">${m}</span>`
      );

      line = line.replace(keywords, '<span class="tok-keyword">$1</span>');
      line = line.replace(types, '<span class="tok-type">$1</span>');

      return this.sanitizer.bypassSecurityTrustHtml(line || '&nbsp;');
    });
  }
  openChat(repoId: string) {
    this.router.navigate(['/chat', repoId]);
  }
}