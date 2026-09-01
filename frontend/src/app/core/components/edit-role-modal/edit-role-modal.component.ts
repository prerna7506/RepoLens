import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type UserRole = 'Admin' | 'Member' | 'Viewer';

interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-edit-role-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-role-modal.component.html',
  styleUrl: './edit-role-modal.component.css'
})
export class EditRoleModalComponent {
  @Input() memberId = '';
  @Input() memberName = '';
  @Input() memberEmail = '';
  @Input() memberAvatar = '';
  @Input() memberInitials = '';
  @Input() currentRole: UserRole = 'Member';

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<{ memberId: string; newRole: UserRole }>();

  selectedRole: UserRole = 'Member';

  roles: RoleOption[] = [
    {
      value: 'Admin',
      label: 'Admin',
      description: 'Full access to all repositories, team management, billing, and system configurations.',
      icon: 'shield'
    },
    {
      value: 'Member',
      label: 'Member',
      description: 'Can view, analyze, and contribute to explicitly assigned repositories. Cannot modify team settings.',
      icon: 'code'
    },
    {
      value: 'Viewer',
      label: 'Viewer',
      description: 'Read-only access to assigned repositories. Can view analysis and search code, but cannot modify anything.',
      icon: 'eye'
    }
  ];

  ngOnInit() {
    this.selectedRole = this.currentRole;
  }

  selectRole(role: UserRole) {
    this.selectedRole = role;
  }

  onClose() {
    this.close.emit();
  }

  onSave() {
    this.save.emit({ memberId: this.memberId, newRole: this.selectedRole });
  }
}