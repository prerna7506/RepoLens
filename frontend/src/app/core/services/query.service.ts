import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

export interface Citation {
  file: string;
  startLine: number;
  endLine: number;
  summary: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
}

export interface QueryHistory {
  id: string;
  question: string;
  answer: string;
  sources: Citation[];
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class QueryService {
  constructor(private http: HttpClient) {}

  ask(question: string, repoId: string): Observable<QueryResponse> {
    return this.http.post<QueryResponse>('/api/query', {
      question,
      repo_id: repoId
    }).pipe(
      timeout(300000) // 5 minute timeout
    );
  }

  getHistory(repoId: string): Observable<{ queries: QueryHistory[] }> {
    return this.http.get<{ queries: QueryHistory[] }>(
      `/api/query/${repoId}/history`
    );
  }

  getFileContent(repoId: string, path: string): Observable<{ content: string }> {
    return this.http.get<{ content: string }>(
      `/api/repos/${repoId}/files/content`,
      { params: { path } }
    );
  }
}