import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { QueryService, Citation } from '../../services/query.service';
import { SocketService } from '../../services/socket.service';
import { FileTreeComponent } from '../file-tree/file-tree.component';
import { QueryHistoryComponent } from '../query-history/query-history.component';
import { RepoSettingsComponent } from '../repo-settings/repo-settings.component';

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
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    FormsModule,
    FileTreeComponent,
    QueryHistoryComponent,
    RepoSettingsComponent
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent implements OnInit, OnDestroy {
  repoId = '';
  repoUrl = '';
  question = '';
  messages: Message[] = [];
  isLoading = false;
  activeUsers: ActiveUser[] = [];
  showSettings = false;
  selectedFile = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private queryService: QueryService,
    private socketService: SocketService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.repoId = this.route.snapshot.paramMap.get('repoId') || '';

    if (isPlatformBrowser(this.platformId)) {
      this.socketService.connect();
      this.socketService.joinRepo(this.repoId);
      this.setupSocketListeners();
    }
  }

  setupSocketListeners() {
    this.socketService.onUserJoined((data) => {
      this.activeUsers.push(data);
    });

    this.socketService.onUserLeft((data) => {
      this.activeUsers = this.activeUsers.filter(
        u => u.userId !== data.userId
      );
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
    });
  }

  ask() {
    if (!this.question.trim() || this.isLoading) return;

    const userMessage = this.question.trim();
    this.question = '';
    this.isLoading = true;

    this.messages.push({ role: 'user', content: userMessage });
    this.messages.push({ role: 'assistant', content: '', loading: true });

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
      }
    });
  }

  onFileSelected(path: string) {
    this.selectedFile = path;
    this.socketService.emitFileCursor(path, 1);
  }

  onHistorySelected(question: string) {
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

  ngOnDestroy() {
    this.socketService.disconnect();
  }
}