import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface HistoryItem {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

@Component({
  selector: 'app-query-history',
  standalone: true,
  imports: [],
  templateUrl: './query-history.component.html',
  styleUrl: './query-history.component.css'
})
export class QueryHistoryComponent implements OnInit, OnChanges {
  @Input() repoId = '';
  @Output() questionSelected = new EventEmitter<string>();

  history: HistoryItem[] = [];

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.repoId) {
      this.loadHistory();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['repoId'] && this.repoId && isPlatformBrowser(this.platformId)) {
      this.loadHistory();
    }
  }

  loadHistory() {
    this.http.get<{ queries: HistoryItem[] }>(
      `/api/query/${this.repoId}/history`
    ).subscribe({
      next: (res) => {
        this.history = this.dedupe(res.queries || []);
        this.cdr.detectChanges();   // ✅ force render — subscribe callbacks don't auto-trigger CD
      },
      error: () => {
        this.history = [];
        this.cdr.detectChanges();
      }
    });
  }

  select(item: HistoryItem) {
    this.questionSelected.emit(item.question);
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  private dedupe(items: HistoryItem[]): HistoryItem[] {
    const seen = new Set<string>();
    const result: HistoryItem[] = [];

    for (const item of items) {
      const bucket = new Date(item.created_at);
      bucket.setSeconds(0, 0);
      const key = `${item.question.trim().toLowerCase()}|${bucket.toISOString()}`;

      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result;
  }
}