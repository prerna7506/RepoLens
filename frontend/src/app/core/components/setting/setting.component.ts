import { Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SearchComponent } from '../search/search.component';
import { AuthService } from '../../services/auth.service';

type SettingsTab = 'profile' | 'api-keys' | 'preferences' | 'usage';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, SearchComponent],
  templateUrl: './setting.component.html',
  styleUrl: './setting.component.css'
})
export class SettingsComponent implements OnInit {
  private auth = inject(AuthService);

  activeTab: SettingsTab = 'profile';
  saving = false;

  // Profile form — reactive to auth signal
  profile = {
    fullName: '',
    username: '',
    email: '',
    avatar: '',
    githubConnected: false,
    githubHandle: ''
  };

  // API Keys
  openaiKey = 'sk-••••••••••••••••••••••••••••••';
  openaiKeyVisible = false;
  webhookSecret = 'whsec_8f92a4b...';

  tabs = [
    { id: 'profile' as SettingsTab, label: 'Profile', icon: 'user' },
    { id: 'api-keys' as SettingsTab, label: 'API Keys', icon: 'key' },
    { id: 'preferences' as SettingsTab, label: 'Preferences', icon: 'sliders' },
    { id: 'usage' as SettingsTab, label: 'Usage & Limits', icon: 'bar-chart' }
  ];

  constructor() {
    // Reactively sync when auth user changes
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.profile.fullName = user.name || 'Jane Doe';
        this.profile.username = user.username || user.github_login || 'janedoe_dev';
        this.profile.email = user.email || 'jane.doe@example.com';
        this.profile.avatar = user.avatar_url || '';
        this.profile.githubConnected = !!user.github_id || !!user.github_login;
        this.profile.githubHandle = user.github_login || this.profile.username;
      }
    });
  }

  ngOnInit() {
    // If user not loaded yet, try fetching
    if (!this.auth.currentUser() && this.auth.isAuthenticated()) {
      this.auth.fetchProfile().subscribe({
        error: () => console.warn('Failed to load user profile')
      });
    }
  }

  setTab(tab: SettingsTab) {
    this.activeTab = tab;
  }

  onSave() {
    this.saving = true;
    // Wire to your API: PUT /api/users/profile
    setTimeout(() => {
      this.saving = false;
      alert('Settings saved!');
    }, 800);
  }

  onCancel() {
    // Reset from signal
    const user = this.auth.currentUser();
    if (user) {
      this.profile.fullName = user.name || '';
      this.profile.username = user.username || '';
      this.profile.email = user.email || '';
      this.profile.avatar = user.avatar_url || '';
    }
  }

  toggleKeyVisibility() {
    this.openaiKeyVisible = !this.openaiKeyVisible;
  }

  rotateKey() {
    if (confirm('Rotate the OpenAI API key?')) {
      this.openaiKey = 'sk-••••••••••••••••••••••••••••••';
    }
  }

  copyWebhook() {
    navigator.clipboard.writeText(this.webhookSecret);
    alert('Copied to clipboard');
  }

  regenerateWebhook() {
    if (confirm('Regenerate GitHub webhook secret?')) {
      this.webhookSecret = 'whsec_' + Math.random().toString(36).substring(2, 10) + '...';
    }
  }

  disconnectGithub() {
    if (confirm('Disconnect GitHub account?')) {
      this.profile.githubConnected = false;
      this.profile.githubHandle = '';
    }
  }

  onAvatarUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { this.profile.avatar = reader.result as string; };
      reader.readAsDataURL(file);
    }
  }
}