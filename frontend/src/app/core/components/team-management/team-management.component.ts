import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SearchComponent } from '../search/search.component';
import { InviteModalComponent } from '../invite-modal/invite-modal.component';
import { EditRoleModalComponent, UserRole } from '../edit-role-modal/edit-role-modal.component';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  initials: string;
  role: UserRole;
  lastActive: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: 'Member' | 'Viewer';
  invitedBy: string;
  invitedAt: string;
}

@Component({
  selector: 'app-team-management',
  standalone: true,
  imports: [CommonModule, SidebarComponent, SearchComponent, InviteModalComponent, EditRoleModalComponent],
  templateUrl: './team-management.component.html',
  styleUrl: './team-management.component.css'
})
export class TeamManagementComponent {
  showInviteModal = false;
  showEditRoleModal = false;

  editRoleMember: TeamMember | null = null;

  stats = {
    totalMembers: 14,
    totalQueries: '8,432',
    totalRepos: 27,
    memberGrowth: '+12% this week'
  };

  members: TeamMember[] = [
    {
      id: '1',
      name: 'Elena Rodriguez',
      email: 'elena.r@example.com',
      avatar: 'https://i.pravatar.cc/150?u=elena',
      initials: 'ER',
      role: 'Admin',
      lastActive: 'Just now'
    },
    {
      id: '2',
      name: 'Marcus Chen',
      email: 'marcus.c@example.com',
      avatar: 'https://i.pravatar.cc/150?u=marcus',
      initials: 'MC',
      role: 'Member',
      lastActive: '2 hours ago'
    },
    {
      id: '3',
      name: 'Sarah Jenkins',
      email: 'sarah.j@example.com',
      initials: 'SJ',
      role: 'Viewer',
      lastActive: 'Yesterday'
    }
  ];

  pending: PendingInvitation[] = [
    {
      id: 'p1',
      email: 'alex.williams@example.com',
      role: 'Member',
      invitedBy: 'Elena Rodriguez',
      invitedAt: '2 days ago'
    },
    {
      id: 'p2',
      email: 'david.kim@example.com',
      role: 'Viewer',
      invitedBy: 'Marcus Chen',
      invitedAt: '5 days ago'
    }
  ];

  contextMenuOpen = false;
  contextMenuX = 0;
  contextMenuY = 0;
  selectedMemberId: string | null = null;

  openInviteModal() {
    this.showInviteModal = true;
  }

  closeInviteModal() {
    this.showInviteModal = false;
  }

  handleInvitation(data: { email: string; role: string; message: string }) {
    this.pending.unshift({
      id: 'p' + Date.now(),
      email: data.email,
      role: data.role as 'Member' | 'Viewer',
      invitedBy: 'You',
      invitedAt: 'Just now'
    });
    this.closeInviteModal();
  }

  openContextMenu(event: MouseEvent, memberId: string) {
    event.stopPropagation();
    this.selectedMemberId = memberId;
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuOpen = true;
  }

  @HostListener('document:click')
  closeContextMenu() {
    this.contextMenuOpen = false;
    this.selectedMemberId = null;
  }

  openEditRoleModal() {
    const member = this.members.find((m) => m.id === this.selectedMemberId);
    if (!member) return;
    this.editRoleMember = member;
    this.showEditRoleModal = true;
    this.closeContextMenu();
  }

  closeEditRoleModal() {
    this.showEditRoleModal = false;
    this.editRoleMember = null;
  }

  saveRole(data: { memberId: string; newRole: UserRole }) {
    const member = this.members.find((m) => m.id === data.memberId);
    if (member) {
      member.role = data.newRole;
    }
    this.closeEditRoleModal();
  }

  resendInvite(id: string) {
    console.log('Resend invite', id);
  }

  revokeInvite(id: string) {
    this.pending = this.pending.filter((p) => p.id !== id);
  }

  viewActivityLog() {
    console.log('View activity for', this.selectedMemberId);
    this.closeContextMenu();
  }

  transferOwnership() {
    console.log('Transfer ownership for', this.selectedMemberId);
    this.closeContextMenu();
  }

  removeMember() {
    if (!this.selectedMemberId) return;
    this.members = this.members.filter((m) => m.id !== this.selectedMemberId);
    this.stats.totalMembers = Math.max(0, this.stats.totalMembers - 1);
    this.closeContextMenu();
  }

  roleClass(role: string): string {
    switch (role) {
      case 'Admin': return 'role-admin';
      case 'Member': return 'role-member';
      case 'Viewer': return 'role-viewer';
      default: return 'role-viewer';
    }
  }
}