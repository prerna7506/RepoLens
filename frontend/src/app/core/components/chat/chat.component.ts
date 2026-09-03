import {
  Component,
  OnInit,
  OnDestroy,
  Inject,
  PLATFORM_ID,
  ElementRef,
  ViewChild,
  HostListener,        
  ChangeDetectorRef
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { QueryService, Citation } from '../../services/query.service';
import { SocketService } from '../../services/socket.service';
import { RepoService, Repo } from '../../services/repo.service';
import { FileTreeComponent } from '../file-tree/file-tree.component';
import { QueryHistoryComponent } from '../query-history/query-history.component';
import { FormatMessagePipe } from '../../pipe/format-message-pipe';

interface Message {
  role: 'user' | 'assistant' | 'shared';
  content: string;
  citations?: Citation[];
  loading?: boolean;
  username?: string;
  timestamp?: string;
}

interface ActiveUser {
  userId: string;
  username: string;
  currentFile?: string;
}

interface FileTab {
  path: string;
  lines: SafeHtml[];
  loading: boolean;
  error?: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    FormsModule,
    FileTreeComponent,
    QueryHistoryComponent,
    FormatMessagePipe
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent implements OnInit, OnDestroy {
  repoId = '';
  repoUrl = '';
  repoFileCount: number | string = '—';
  question = '';
  messages: Message[] = [];
  isLoading = false;
  activeUsers: ActiveUser[] = [];
  showSettings = false;
  selectedFile = '';

  activeDrawer: 'files' | 'history' | null = null;

  // Code viewer state
  openTabs: FileTab[] = [];
  activeTabIndex = 0;
  highlightRange: { start: number; end: number } | null = null;

  @ViewChild('codeScroll') codeScrollRef?: ElementRef<HTMLDivElement>;
  @ViewChild('resizer') resizerRef!: ElementRef<HTMLDivElement>;  // ← ADD THIS

  private isResizing = false;  // ← ADD THIS

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private queryService: QueryService,
    private socketService: SocketService,
    private repoService: RepoService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.repoId = this.route.snapshot.paramMap.get('repoId') || '';
    this.loadRepoMeta();

    if (isPlatformBrowser(this.platformId)) {
      this.socketService.connect();
      this.socketService.joinRepo(this.repoId);
      this.setupSocketListeners();
    }
  }

  private loadRepoMeta() {
    this.repoService.getRepos().subscribe({
      next: (res) => {
        const repo = res.repos.find((r: Repo) => r.id === this.repoId);
        if (repo) {
          this.repoUrl = repo.github_url;
          this.repoFileCount = repo.file_count || '—';
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  get repoLabel(): string {
    if (!this.repoUrl) return this.repoId;
    try {
      const u = new URL(this.repoUrl);
      const [, owner, name] = u.pathname.split('/');
      return owner && name ? `${owner}/${name}` : this.repoUrl;
    } catch {
      return this.repoUrl;
    }
  }

  setupSocketListeners() {
    this.socketService.onUserJoined((data: ActiveUser) => {
      this.activeUsers.push(data);
      this.cdr.detectChanges();
    });

    this.socketService.onUserLeft((data: { userId: string }) => {
      this.activeUsers = this.activeUsers.filter((u) => u.userId !== data.userId);
      this.cdr.detectChanges();
    });

    this.socketService.onFileCursor((data: { userId: string; username: string; path: string }) => {
      const user = this.activeUsers.find((u) => u.userId === data.userId);
      if (user) user.currentFile = data.path;
      this.cdr.detectChanges();
    });

    this.socketService.onQueryShared((data) => {
      this.messages.push({
        role: 'shared',
        content: data.answer,
        citations: data.citations,
        username: data.username,
        timestamp: data.timestamp
      });
      this.scrollToBottom();
      this.cdr.detectChanges();
    });
  }

  ask() {
    if (!this.question.trim() || this.isLoading) return;

    const userMessage = this.question.trim();
    this.question = '';
    this.isLoading = true;

    this.messages.push({ role: 'user', content: userMessage });
    this.messages.push({ role: 'assistant', content: '', loading: true });
    this.cdr.detectChanges();
    this.scrollToBottom();  
    this.queryService.ask(userMessage, this.repoId).subscribe({
      next: (res) => {
        this.messages[this.messages.length - 1] = {
          role: 'assistant',
          content: res.answer,
          citations: res.citations,
          loading: false
        };
        this.isLoading = false;
        this.scrollToBottom();
        this.cdr.detectChanges();
        this.socketService.emitNewQuery({
          question: userMessage,
          answer: res.answer,
          citations: res.citations
        });
      },
      error: () => {
        this.messages[this.messages.length - 1] = {
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          loading: false
        };
        this.isLoading = false;
        this.scrollToBottom();  
        this.cdr.detectChanges();
      }
    });
  }

  onHistorySelected(question: string) {
    this.activeDrawer = null;
    this.cdr.detectChanges(); 
    this.question = question;
    this.ask();
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.ask();
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  scrollToBottom() {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const el = document.getElementById('chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 100);
  }

  toggleDrawer(drawer: 'files' | 'history') {
    this.activeDrawer = this.activeDrawer === drawer ? null : drawer;
  }

  /* ── Panel resizing ── */

  startResize(event: MouseEvent | TouchEvent): void {
    this.isResizing = true;
    this.resizerRef.nativeElement.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    if (event.preventDefault) event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onResizeMove(event: MouseEvent): void {
    if (!this.isResizing) return;
    const shell = document.querySelector('.chat-shell') as HTMLElement;
    const leftPanel = document.querySelector('.assistant-panel') as HTMLElement;
    if (!shell || !leftPanel) return;

    const minWidth = 280;
    const maxWidth = shell.clientWidth - minWidth - 5;
    const newWidth = Math.max(minWidth, Math.min(event.clientX, maxWidth));
    leftPanel.style.width = `${newWidth}px`;
  }

  @HostListener('document:touchmove', ['$event'])
  onResizeTouchMove(event: TouchEvent): void {
    if (!this.isResizing) return;
    const shell = document.querySelector('.chat-shell') as HTMLElement;
    const leftPanel = document.querySelector('.assistant-panel') as HTMLElement;
    if (!shell || !leftPanel) return;

    const touch = event.touches[0];
    const minWidth = 280;
    const maxWidth = shell.clientWidth - minWidth - 5;
    const newWidth = Math.max(minWidth, Math.min(touch.clientX, maxWidth));
    leftPanel.style.width = `${newWidth}px`;
  }

  @HostListener('document:mouseup')
  @HostListener('document:touchend')
  stopResize(): void {
    if (!this.isResizing) return;
    this.isResizing = false;
    this.resizerRef.nativeElement.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  /* ── Code viewer ── */

  onFileSelected(path: string) {
    this.activeDrawer = null;
    this.openFile(path);
  }

  openFile(path: string) {
    this.selectedFile = path;
    this.highlightRange = null;

    const existingIndex = this.openTabs.findIndex((t) => t.path === path);
    if (existingIndex >= 0) {
      this.activeTabIndex = existingIndex;
    } else {
      const tab: FileTab = { path, lines: [], loading: true };
      this.openTabs.push(tab);
      this.activeTabIndex = this.openTabs.length - 1;
      this.fetchFileContent(path, tab);
    }

    if (isPlatformBrowser(this.platformId)) {
      this.socketService.emitFileCursor(path, 1);
    }
  }

  closeTab(index: number, event: MouseEvent) {
    event.stopPropagation();
    this.openTabs.splice(index, 1);
    if (this.activeTabIndex >= this.openTabs.length) {
      this.activeTabIndex = Math.max(0, this.openTabs.length - 1);
    }
  }

  selectTab(index: number) {
    this.activeTabIndex = index;
    this.highlightRange = null;
    this.selectedFile = this.openTabs[index]?.path || '';
  }

  private fetchFileContent(path: string, tab: FileTab) {
    this.queryService.getFileContent(this.repoId, path).subscribe({
      next: (res: { content: string }) => {
        tab.lines = this.highlightTs(res.content);
        tab.loading = false;
      },
      error: () => {
        tab.error = 'Could not load file content.';
        tab.loading = false;
      }
    });
  }

  get activeTab(): FileTab | undefined {
    return this.openTabs[this.activeTabIndex];
  }

  get activeFileViewers(): ActiveUser[] {
    const path = this.activeTab?.path;
    if (!path) return [];
    return this.activeUsers.filter((u) => u.currentFile === path);
  }

  fileName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }

  breadcrumb(path: string): string[] {
    return path.split('/').filter(Boolean);
  }

  isHighlighted(lineNumber: number): boolean {
    if (!this.highlightRange) return false;
    return lineNumber >= this.highlightRange.start && lineNumber <= this.highlightRange.end;
  }

  jumpToCitation(citation: Citation) {
    this.openFile(citation.file);
    this.highlightRange = { start: citation.startLine, end: citation.endLine };

    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const container = this.codeScrollRef?.nativeElement;
      const target = container?.querySelector(`[data-line="${citation.startLine}"]`);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 150);
  }

  private highlightTs(code: string): SafeHtml[] {
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const keywords =
      /\b(import|export|const|let|var|function|return|if|else|for|while|new|class|interface|extends|implements|from|as|async|await|try|catch|throw|typeof|in|of|void|this|public|private|protected|readonly)\b/g;
    const types = /\b(string|number|boolean|any|unknown|Request|Response|NextFunction)\b/g;

    return code.split('\n').map((rawLine) => {
      let line = escapeHtml(rawLine);

      line = line.replace(
        /(&#39;|'|")((?:\\.|(?!\1).)*)\1/g,
        (m) => `<span class="tok-string">${m}</span>`
      );

      line = line.replace(/(\/\/.*$)/, '<span class="tok-comment">$1</span>');
      line = line.replace(keywords, '<span class="tok-keyword">$1</span>');
      line = line.replace(types, '<span class="tok-type">$1</span>');

      return this.sanitizer.bypassSecurityTrustHtml(line || '&nbsp;');
    });
  }

  ngOnDestroy() {
    this.socketService.disconnect();
  }
}