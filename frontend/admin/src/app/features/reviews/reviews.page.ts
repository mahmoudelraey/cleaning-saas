import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { TenantService } from '../../core/tenant.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';

export interface ReviewRow {
  id: string;
  bookingId: string;
  bookingNumber: number;
  customerName: string;
  rating: number;
  comment?: string;
  published: boolean;
  createdAt: string;
}

type Filter = 'all' | 'shown' | 'hidden';

/** Customer ratings of completed visits. The owner picks which comments appear on the public page. */
@Component({
  selector: 'app-reviews',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, SelectButton, ToggleSwitch, LocalDatePipe],
  styleUrl: './reviews.page.scss',
  templateUrl: './reviews.page.html',
})
export class ReviewsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);
  protected readonly tenants = inject(TenantService);

  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly fiveDesc = [5, 4, 3, 2, 1];
  protected readonly rows = signal<ReviewRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal<string | null>(null);
  protected filter: Filter = 'all';

  protected readonly canPublish = computed(() => this.auth.hasRole('OWNER'));
  protected readonly shownCount = computed(() => this.rows().filter((r) => r.published).length);
  protected readonly average = computed(() => {
    const r = this.rows();
    return r.length ? (Math.round((r.reduce((s, x) => s + x.rating, 0) / r.length) * 10) / 10).toFixed(1) : '0.0';
  });
  protected readonly roundAvg = computed(() => Math.round(Number(this.average())));
  protected readonly filters = computed(() => [
    { label: this.translate.instant('reviews.filter.all'), value: 'all' },
    { label: this.translate.instant('reviews.filter.shown'), value: 'shown' },
    { label: this.translate.instant('reviews.filter.hidden'), value: 'hidden' },
  ]);

  ngOnInit(): void {
    this.tenants.ensureLoaded().subscribe({ error: () => {} });
    this.http.get<ReviewRow[]>('/api/v1/reviews').subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected visible(): ReviewRow[] {
    const f = this.filter;
    return this.rows().filter((r) => f === 'all' || (f === 'shown' ? r.published : !r.published));
  }

  protected countOf(n: number): number {
    return this.rows().filter((r) => r.rating === n).length;
  }

  protected share(n: number): number {
    return this.rows().length ? (this.countOf(n) / this.rows().length) * 100 : 0;
  }

  protected setShown(r: ReviewRow, published: boolean): void {
    this.busy.set(r.id);
    this.http.put(`/api/v1/reviews/${r.id}/published`, { published }).subscribe({
      next: () => {
        this.busy.set(null);
        this.rows.update((l) => l.map((x) => (x.id === r.id ? { ...x, published } : x)));
        this.messages.add({ severity: 'success', summary: this.translate.instant(published ? 'reviews.shown' : 'reviews.hidden') });
      },
      error: (e) => {
        this.busy.set(null);
        this.rows.update((l) => [...l]);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }
}
