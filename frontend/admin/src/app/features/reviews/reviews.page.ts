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
  styles: `
    .summary { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .avg { font-size: 2.4rem; font-weight: 700; line-height: 1; direction: ltr; }
    .stars { color: #f0a92e; direction: ltr; white-space: nowrap; }
    .bars { flex: 1; min-width: 220px; max-width: 360px; display: grid; gap: .2rem; }
    .bar { display: grid; grid-template-columns: 1.2rem 1fr 2rem; align-items: center; gap: .5rem; font-size: .8rem; color: var(--fo-muted); direction: ltr; }
    .bar span.track { height: 6px; border-radius: 99px; background: var(--fo-bg); overflow: hidden; }
    .bar span.fill { display: block; height: 100%; background: #f0a92e; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; margin-bottom: .75rem; }
    .list { display: flex; flex-direction: column; gap: .6rem; }
    .rev { display: flex; gap: 1rem; align-items: flex-start; }
    .rev .body { flex: 1; min-width: 0; }
    .rev .top { display: flex; flex-wrap: wrap; gap: .25rem .75rem; align-items: center; }
    .rev .comment { margin: .4rem 0 0; white-space: pre-line; }
    .rev .meta { font-size: .8rem; color: var(--fo-muted); }
    .rev .none { font-style: italic; color: var(--fo-muted); margin: .4rem 0 0; font-size: .9rem; }
    .show { display: flex; align-items: center; gap: .5rem; font-size: .85rem; white-space: nowrap; }
    .low { border-inline-start: 3px solid var(--p-orange-400, #fb923c); }
    .empty { text-align: center; color: var(--fo-muted); padding: 3rem 1rem; }
    .empty i { font-size: 2rem; display: block; margin-bottom: .5rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'reviews.title' | translate }}</h1>
        <p>{{ 'reviews.subtitle' | translate }}</p>
      </div>
      <a [href]="tenants.portalUrl()" target="_blank" rel="noopener">
        <p-button icon="pi pi-external-link" [label]="'reviews.viewPage' | translate" [outlined]="true" />
      </a>
    </div>

    @if (rows().length) {
      <div class="panel summary">
        <span class="avg">{{ average() }}</span>
        <div>
          <div class="stars">@for (n of five; track n) { <i class="pi" [class.pi-star-fill]="n <= roundAvg()" [class.pi-star]="n > roundAvg()"></i> }</div>
          <div class="meta muted">{{ 'reviews.count' | translate: { n: rows().length, shown: shownCount() } }}</div>
        </div>
        <div class="bars" aria-hidden="true">
          @for (n of fiveDesc; track n) {
            <div class="bar"><span>{{ n }}★</span><span class="track"><span class="fill" [style.width.%]="share(n)"></span></span><span>{{ countOf(n) }}</span></div>
          }
        </div>
      </div>

      <div class="toolbar">
        <p-selectbutton [options]="filters()" [(ngModel)]="filter" optionLabel="label" optionValue="value" [allowEmpty]="false" />
        <span class="muted" style="font-size:.85rem">{{ 'reviews.averageNote' | translate }}</span>
      </div>

      <div class="list">
        @for (r of visible(); track r.id) {
          <div class="panel rev" [class.low]="r.rating <= 2">
            <div class="body">
              <div class="top">
                <span class="stars">@for (n of five; track n) { <i class="pi" [class.pi-star-fill]="n <= r.rating" [class.pi-star]="n > r.rating"></i> }</span>
                <strong>{{ r.customerName }}</strong>
                <a class="meta" [routerLink]="['/bookings', r.bookingId]">#{{ r.bookingNumber }}</a>
                <span class="meta">{{ r.createdAt | ldate: 'medium' }}</span>
              </div>
              @if (r.comment) { <p class="comment" dir="auto">{{ r.comment }}</p> } @else { <p class="none">{{ 'reviews.noComment' | translate }}</p> }
            </div>
            <label class="show">
              <p-toggleswitch [ngModel]="r.published" (ngModelChange)="setShown(r, $event)" [disabled]="!canPublish() || busy() === r.id" />
              {{ 'reviews.showOnPage' | translate }}
            </label>
          </div>
        } @empty {
          <div class="empty">{{ 'reviews.noneInFilter' | translate }}</div>
        }
      </div>
    } @else if (!loading()) {
      <div class="panel empty">
        <i class="pi pi-star"></i>
        <strong>{{ 'reviews.emptyTitle' | translate }}</strong>
        <p>{{ 'reviews.emptyHint' | translate }}</p>
      </div>
    } @else {
      <div class="empty"><i class="pi pi-spin pi-spinner"></i></div>
    }
  `,
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
