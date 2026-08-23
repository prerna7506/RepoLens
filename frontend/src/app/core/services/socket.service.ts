import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  constructor(
    private auth: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  connect() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.socket?.connected) return;

    this.socket = io('http://localhost:3000', {
      auth: { token: this.auth.getAccessToken() },
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket error:', err.message);
    });
  }

  joinRepo(repoId: string) {
    this.socket?.emit('join:repo', repoId);
  }

  emitNewQuery(data: { question: string; answer: string; citations: any[] }) {
    this.socket?.emit('query:new', data);
  }

  emitFileCursor(filePath: string, line: number) {
    this.socket?.emit('cursor:file', { filePath, line });
  }

  onUserJoined(cb: (data: any) => void) {
    this.socket?.on('user:joined', cb);
  }

  onUserLeft(cb: (data: any) => void) {
    this.socket?.on('user:left', cb);
  }

  onQueryShared(cb: (data: any) => void) {
    this.socket?.on('query:shared', cb);
  }

  onFileCursor(cb: (data: any) => void) {
    this.socket?.on('cursor:file', cb);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}