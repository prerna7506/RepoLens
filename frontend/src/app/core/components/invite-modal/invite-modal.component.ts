import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface RoleOption {
  value: 'Admin' | 'Member' | 'Viewer';
  label: string;
  description: string;
}

@Component({
  selector: 'app-invite-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invite-modal.component.html',
  styleUrl: './invite-modal.component.css'
})
export class InviteModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() send = new EventEmitter<{ email: string; role: string; message: string }>();

  email = '';
  message = '';
  selectedRole: 'Admin' | 'Member' | 'Viewer' = 'Member';

  roles: RoleOption[] = [
    {
      value: 'Admin',
      label: 'Admin',
      description: 'Full access to all repositories and team settings.'
    },
    {
      value: 'Member',
      label: 'Member',
      description: 'Can view and contribute to assigned repositories.'
    },
    {
      value: 'Viewer',
      label: 'Viewer',
      description: 'Read-only access to repositories and discussions.'
    }
  ];

  selectRole(role: 'Admin' | 'Member' | 'Viewer') {
    this.selectedRole = role;
  }

  onClose() {
    this.close.emit();
  }

  onSend() {
    if (!this.email.trim()) return;
    this.send.emit({
      email: this.email.trim(),
      role: this.selectedRole,
      message: this.message.trim()
    });
    this.reset();
  }

  private reset() {
    this.email = '';
    this.message = '';
    this.selectedRole = 'Member';
  }
}