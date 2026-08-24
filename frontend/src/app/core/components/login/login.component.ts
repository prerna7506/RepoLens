import { Component, OnInit, Inject, PLATFORM_ID, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit, AfterViewInit {
  isCallback = false;

  @ViewChild('networkCanvas') networkCanvas!: ElementRef<HTMLCanvasElement>;

  constructor(
    public auth: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const fragment = window.location.hash.replace('#', '');
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');

    if (accessToken) {
      this.isCallback = true;
      this.auth.setAccessToken(accessToken);
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId) && !this.isCallback && this.networkCanvas) {
      this.initNetworkBackground();
    }
  }

  private initNetworkBackground() {
    const canvas = this.networkCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
    }

    const nodes: Node[] = [];
    const count = 22;

    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() * 2 + 1.5
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 240) {
            const opacity = (1 - dist / 240) * 0.12;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(56, 189, 248, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes with soft glow
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.fill();

        const gradient = ctx.createRadialGradient(
          node.x, node.y, 0,
          node.x, node.y, node.radius * 4
        );
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
      }

      requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener('resize', resize);
  }
}