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
  styleUrl: './toast.scss',
  templateUrl: './toast.html',
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
}
