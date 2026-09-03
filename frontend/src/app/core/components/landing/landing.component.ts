import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent {
  features = [
    {
      title: 'AST-Aware Ingestion',
      description: 'Deep semantic understanding of your code structure. We parse the Abstract Syntax Tree, differentiating between variables, functions, and classes—not just keywords.'
    },
    {
      title: 'Hybrid Search',
      description: 'Combining dense vector embeddings for conceptual matching with Full-Text Search (FTS) for exact keyword lookups. 100% accuracy, zero hallucinations.'
    },
    {
      title: 'Real-time Collaboration',
      description: 'Shared repository indexes mean your entire team accesses the same truth. Share citations, link to exact AI analyses, and onboard new devs instantly.'
    }
  ];
  scrollToSection(id: string): void {
    const el = document.querySelector(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}