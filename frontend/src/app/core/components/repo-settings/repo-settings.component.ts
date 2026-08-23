import { Component, Input, Output, EventEmitter } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RepoService } from '../../services/repo.service';

@Component({
  selector: 'app-repo-settings',
  standalone: true,
  imports: [],
  templateUrl: './repo-settings.component.html',
  styleUrl: './repo-settings.component.css'
})
export class RepoSettingsComponent {
  @Input() repoId = '';
  @Input() repoUrl = '';
  @Output() deleted = new EventEmitter<void>();
  @Output() reindexed = new EventEmitter<string>();

  isReindexing = false;
  isDeleting = false;
  message = '';

  constructor(
    private http: HttpClient,
    private repoService: RepoService
  ) {}

  reindex() {
    this.isReindexing = true;
    this.message = '';
    this.http.post<{ task_id: string }>(
      `/api/repos/${this.repoId}/reindex`, {}
    ).subscribe({
      next: (res) => {
        this.message = '✅ Re-indexing started!';
        this.isReindexing = false;
        this.reindexed.emit(res.task_id);
      },
      error: () => {
        this.message = '❌ Re-index failed';
        this.isReindexing = false;
      }
    });
  }

  delete() {
    if (!confirm(`Delete ${this.repoUrl}? This cannot be undone.`)) return;
    this.isDeleting = true;
    this.http.delete(`/api/repos/${this.repoId}`).subscribe({
      next: () => this.deleted.emit(),
      error: () => {
        this.message = '❌ Delete failed';
        this.isDeleting = false;
      }
    });
  }
}