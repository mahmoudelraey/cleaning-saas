import { Component, Injectable, inject, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, tone: Toast['tone'] = 'ok'): void {
    const id = ++this.seq;
    this.items.update((l) => [...l, { id, text, tone }]);
    setTimeout(() => this.items.update((l) => l.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }
}

@Component({
  selector: 'pt-toasts',
  styles: `
    :host { position: fixed; inset-inline: 0; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 60;
            display: grid; justify-items: center; gap: .5rem; pointer-events: none; padding-inline: 16px; }
    .t { pointer-events: auto; max-width: 480px; padding: .75rem 1rem; border-radius: 14px; font-size: .92rem;
         background: var(--ink); color: #fff; box-shadow: 0 12px 30px -12px rgba(15, 42, 61, .5);
         display: flex; gap: .6rem; align-items: center; animation: rise .25s ease-out; }
    .t.error { background: var(--rose); }
    @keyframes rise { from { transform: translateY(8px); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .t { animation: none; } }
  `,
  template: `
    @for (t of toasts.items(); track t.id) {
      <div class="t" [class.error]="t.tone === 'error'" role="status">
        <i [class]="t.tone === 'error' ? 'pi pi-exclamation-circle' : 'pi pi-check-circle'"></i>{{ t.text }}
      </div>
    }
  `,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
}
