import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
@Pipe({ name: 'formatMessage', standalone: true })
export class FormatMessagePipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(content: string): SafeHtml {
    if (!content) return '';

    const paragraphs = content.split(/\n{2,}/);

    const html = paragraphs
      .map((block) => {
        const lines = block.split('\n').filter((l) => l.trim().length > 0);
        const isNumberedList =
          lines.length > 0 && lines.every((l) => /^\s*\d+\.\s/.test(l));

        if (isNumberedList) {
          const items = lines
            .map((l) => {
              const text = l.replace(/^\s*\d+\.\s/, '');
              return `<li>${this.inline(this.escapeHtml(text))}</li>`;
            })
            .join('');
          return `<ol class="msg-list">${items}</ol>`;
        }

        return `<p>${this.inline(this.escapeHtml(block))}</p>`;
      })
      .join('');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private inline(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="msg-code">$1</code>')
      .replace(/\n/g, '<br/>');
  }
}