import { Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Drawer } from 'primeng/drawer';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { AnalyticsApi, DrillQuery, RecordPage } from './analytics.api';
import { STATUS_COLORS } from './charts';
import { StateBlock } from './widgets';

const PAGE = 25;

/** Side panel with the bookings or invoices behind a chart point (drill-down). */
@Component({
  selector: 'app-records-drawer',
  imports: [Drawer, TableModule, Tag, RouterLink, TranslatePipe, SarPipe, LocalDatePipe, StateBlock],
  styles: `
    .summary { display: flex; gap: 1rem; flex-wrap: wrap; color: var(--fo-muted); font-size: .9rem; margin-bottom: .75rem; }
    .summary strong { color: var(--fo-text); }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: .35rem; }
    td small { color: var(--fo-muted); display: block; }
    .num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  `,
  template: `
    <p-drawer [visible]="!!drill()" (visibleChange)="!$event && drill.set(null)" position="right" [modal]="true"
              [style]="{ width: '760px', maxWidth: '100vw' }" [header]="drill()?.title ?? ''" [blockScroll]="true">
      @if (drill(); as d) {
        <div class="summary">
          <span>{{ d.query.from | ldate: 'mediumDate' }} – {{ d.query.to | ldate: 'mediumDate' }}</span>
          @if (page(); as p) {
            <span>{{ (d.kind === 'REVENUE' ? 'analytics.nInvoices' : 'analytics.nRequests') | translate: { n: p.total } }}</span>
            <span>{{ (d.kind === 'REVENUE' ? 'analytics.revenue' : 'analytics.bookingValue') | translate }}: <strong class="ltr">{{ p.totalAmountHalalas | sar }}</strong></span>
          }
        </div>
        @if (error()) {
          <app-state kind="error" [message]="error()" (retry)="load(first())" />
        } @else {
          <p-table [value]="page()?.items ?? []" [lazy]="true" (onLazyLoad)="onLazy($event)" [paginator]="true" [rows]="pageSize"
                   [totalRecords]="page()?.total ?? 0" [loading]="loading()" [first]="first()" dataKey="id" [rowHover]="true" size="small">
            <ng-template #header>
              <tr>
                <th>#</th>
                <th>{{ 'analytics.date' | translate }}</th>
                <th>{{ 'analytics.customer' | translate }}</th>
                <th>{{ 'analytics.city' | translate }}</th>
                <th>{{ 'common.status' | translate }}</th>
                <th class="num">{{ (d.kind === 'REVENUE' ? 'analytics.revenue' : 'analytics.bookingValue') | translate }}</th>
              </tr>
            </ng-template>
            <ng-template #body let-r>
              <tr>
                <td>
                  @if (r.kind === 'REVENUE') {
                    <a [routerLink]="['/invoices', r.id]" class="ltr">INV-{{ r.number }}</a>
                    @if (r.bookingNumber) { <small class="ltr">#{{ r.bookingNumber }}</small> }
                  } @else {
                    <a [routerLink]="['/bookings', r.id]" class="ltr">#{{ r.number }}</a>
                    @if (r.invoiceNumber) { <small class="ltr">INV-{{ r.invoiceNumber }}</small> }
                  }
                </td>
                <td>{{ r.date | ldate: 'medium' }}</td>
                <td>{{ r.customerName }}<small>{{ r.services }}</small></td>
                <td>{{ (en() ? r.cityEn : r.cityAr) || '—' }}</td>
                <td>
                  @if (r.kind === 'REVENUE') {
                    <p-tag [value]="'invoiceStatus.' + r.status | translate" severity="secondary" />
                  } @else {
                    <span class="dot" [style.background]="color(r.status)"></span>{{ 'bookingStatus.' + r.status | translate }}
                  }
                </td>
                <td class="num"><span class="ltr">{{ r.amountHalalas | sar }}</span></td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr><td colspan="6"><app-state kind="empty" /></td></tr>
            </ng-template>
          </p-table>
        }
      }
    </p-drawer>
  `,
})
export class RecordsDrawer {
  private readonly api = inject(AnalyticsApi);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  readonly drill = model<DrillQuery | null>(null);

  protected readonly pageSize = PAGE;
  protected readonly page = signal<RecordPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly first = signal(0);
  protected readonly en = computed(() => this.lang.current() === 'en');

  constructor() {
    effect(() => {
      if (this.drill()) {
        this.page.set(null);
        this.first.set(0);
        this.load(0);
      }
    });
  }

  protected onLazy(e: TableLazyLoadEvent): void {
    const first = e.first ?? 0;
    if (first !== this.first()) {
      this.first.set(first);
      this.load(first);
    }
  }

  load(first: number): void {
    const d = this.drill();
    if (!d) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.records(d, this.lang.current(), Math.floor(first / PAGE), PAGE).subscribe({
      next: (p) => {
        this.page.set(p);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e, this.translate));
        this.loading.set(false);
      },
    });
  }

  protected color(status: string): string {
    return STATUS_COLORS[status] ?? '#94a3b8';
  }
}
