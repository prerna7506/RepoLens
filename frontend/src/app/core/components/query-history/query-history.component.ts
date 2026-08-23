import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
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
export class QueryHistoryComponent implements OnInit {
  @Input() repoId = '';
  @Output() questionSelected = new EventEmitter<string>();

  history: HistoryItem[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.http.get<{ queries: HistoryItem[] }>(
      `/api/query/${this.repoId}/history`
    ).subscribe((res) => {
      this.history = res.queries;
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
}