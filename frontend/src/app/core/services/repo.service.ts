import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Repo {
  id: string;
  github_url: string;
  status: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;  
  last_indexed_commit: string | null;
  file_count: number;
  stars?: number;
  forks?: number;
  last_updated?: string;
}

@Injectable({ providedIn: 'root' })
export class RepoService {
  constructor(private http: HttpClient) {}

  getRepos(): Observable<{ repos: Repo[] }> {
    return this.http.get<{ repos: Repo[] }>('/api/repos');
  }

  createRepo(githubUrl: string): Observable<{ repo: Repo; task_id: string }> {
    return this.http.post<{ repo: Repo; task_id: string }>('/api/repos', {
      github_url: githubUrl
    });
  }

  getTaskStatus(taskId: string): Observable<{ state: string; result: any }> {
    return this.http.get<{ state: string; result: any }>(
      `/api/repos/tasks/${taskId}`
    );
  }
  deleteRepo(id: string): Observable<void> {
    return this.http.delete<void>(`/api/repos/${id}`);
  }
  getFileContent(repoId: string, path: string): Observable<{ content: string; language?: string }> {
    return this.http.get<{ content: string; language?: string }>(
      `/api/repos/${repoId}/file`,
      { params: { path } }
    );
  }
}