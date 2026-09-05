import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface FileNode {
  path: string;
  language: string;
  index_status: string;
  size_bytes: number;
}

interface TreeItem {
  name: string;
  path: string;
  isFolder: boolean;
  children: Map<string, TreeItem>;
  language?: string;
}

export interface FlatNode {
  name: string;
  path: string;
  isFolder: boolean;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  language?: string;
}

interface LanguageStat {
  language: string;
  percent: number;
  color: string;
}

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f1e05a',
  html: '#e34c26',
  css: '#563d7c',
  json: '#292929',
  python: '#3572A5',
  markdown: '#083fa1',
  other: '#8b949e'
};

@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [],
  templateUrl: './file-tree.component.html',
  styleUrl: './file-tree.component.css'
})
export class FileTreeComponent implements OnInit, OnChanges {
  @Input() repoId = '';
  @Output() fileSelected = new EventEmitter<string>();

  flatNodes: FlatNode[] = [];
  languageStats: LanguageStat[] = [];
  selectedFile = '';
  errorMsg = '';
  private folderState = new Map<string, boolean>();
  private treeRoot = new Map<string, TreeItem>();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.loadIfReady();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['repoId'] && this.repoId) {
      this.loadIfReady();
    }
  }

  loadIfReady() {
    // Guarded here (not duplicated in both lifecycle hooks) so neither ngOnInit
    // nor ngOnChanges can trigger an HTTP call during SSR — there's no browser,
    // no auth cookie, and no isPlatformBrowser check was protecting ngOnChanges before.
    if (!isPlatformBrowser(this.platformId)) return;

    if (!this.repoId) {
      this.errorMsg = 'No repo selected';
      this.flatNodes = [];
      return;
    }
    this.errorMsg = '';
    this.loadFiles();
  }

  loadFiles() {
    const url = `/api/repos/${this.repoId}/files`;
    console.log('FileTree: fetching', url);

    this.http.get<{ files: FileNode[] }>(url).subscribe({
      next: (res) => {
        const files = res.files || [];
        console.log('FileTree: got', files.length, 'files');

        if (files.length === 0) {
          this.flatNodes = [];
          this.languageStats = [];
          this.errorMsg = 'No files found';
          this.cdr.detectChanges();
          return;
        }

        this.buildTree(files);
        this.flatten();
        this.languageStats = this.computeLanguageStats(files);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.flatNodes = [];
        this.languageStats = [];
        this.errorMsg = err.status === 401 ? 'Unauthorized' : 'Failed to load';
        this.cdr.detectChanges();
      }
    });
  }

  buildTree(files: FileNode[]) {
    this.treeRoot = new Map();

    for (const file of files) {
      const parts = file.path.replace(/\\/g, '/').split('/');
      let current = this.treeRoot;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const fullPath = parts.slice(0, i + 1).join('/');

        if (!current.has(part)) {
          current.set(part, {
            name: part,
            path: fullPath,
            isFolder: !isLast,
            children: new Map(),
            language: isLast ? file.language : undefined
          });
        }
        current = current.get(part)!.children;
      }
    }
  }

  flatten() {
    this.flatNodes = [];
    this.flattenLevel(this.treeRoot, 0);
  }

  flattenLevel(level: Map<string, TreeItem>, depth: number) {
    const sorted = Array.from(level.values()).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of sorted) {
      const expanded = this.folderState.get(child.path) ?? false;

      this.flatNodes.push({
        name: child.name,
        path: child.path,
        isFolder: child.isFolder,
        depth: depth,
        expanded: expanded,
        hasChildren: child.isFolder && child.children.size > 0,
        language: child.language
      });

      if (child.isFolder && expanded) {
        this.flattenLevel(child.children, depth + 1);
      }
    }
  }

  toggle(node: FlatNode) {
    if (node.isFolder) {
      const newState = !node.expanded;
      this.folderState.set(node.path, newState);
      this.flatten();
      this.cdr.detectChanges();
    } else {
      this.selectedFile = node.path;
      this.fileSelected.emit(node.path);
    }
  }

  getIconType(node: FlatNode): string {
    if (node.isFolder) return node.expanded ? 'folder-open' : 'folder';
    if (node.name.endsWith('.ts')) return 'file-code';
    if (node.name.endsWith('.js')) return 'file-code';
    if (node.name.endsWith('.html')) return 'file-code';
    if (node.name.endsWith('.css')) return 'palette';
    if (node.name.endsWith('.json')) return 'braces';
    return 'file';
  }

  private computeLanguageStats(files: FileNode[]): LanguageStat[] {
    const bytesByLang = new Map<string, number>();

    for (const f of files) {
      const lang = (f.language || 'other').toLowerCase();
      bytesByLang.set(lang, (bytesByLang.get(lang) || 0) + (f.size_bytes || 0));
    }

    const totalBytes = Array.from(bytesByLang.values()).reduce((a, b) => a + b, 0);
    if (totalBytes === 0) return []; // avoid divide-by-zero if size_bytes isn't populated yet

    return Array.from(bytesByLang.entries())
      .map(([language, bytes]) => ({
        language,
        percent: Math.round((bytes / totalBytes) * 1000) / 10,
        color: LANGUAGE_COLORS[language] || LANGUAGE_COLORS['other']
      }))
      .sort((a, b) => b.percent - a.percent);
  }
}