import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';

import { NotificationLog, NotificationStatus, Page } from '../../core/api.types';
import { PhonePipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';

export const NOTIFICATION_SEVERITY: Record<NotificationStatus, 'success' | 'info' | 'warn' | 'danger' | 'secondary'> = {
  PENDING: 'warn',
  SENT: 'info',
  DELIVERED: 'success',
  READ: 'success',
  FAILED: 'danger',
  SKIPPED: 'secondary',
};

/** Send log: every customer message, its channel and delivery status. Also embedded per booking. */
@Component({
  selector: 'app-messages',
  imports: [RouterLink, TranslatePipe, TableModule, Tag, PhonePipe, LocalDatePipe],
  styles: `
    .body { max-width: 520px; white-space: normal; }
    .err { color: var(--p-red-500); font-size: .8rem; }

    /* compact = card list embedded in the booking page */
    .list { display: flex; flex-direction: column; gap: .6rem; }
    .msg { display: flex; gap: .75rem; align-items: center; border: 1px solid var(--fo-border); border-radius: 12px; padding: .75rem .9rem; }
    .msg .txt { flex: 1; min-width: 0; }
    .msg .top { display: flex; align-items: center; gap: .5rem; justify-content: space-between; }
    .msg strong { font-size: .92rem; }
    .msg time { display: block; font-size: .75rem; color: var(--fo-muted); margin: .15rem 0 .3rem; }
    .msg .preview { font-size: .82rem; color: var(--fo-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .msg .ch { font-size: 1.35rem; color: var(--fo-muted); flex: none; }
    .msg .ch.pi-whatsapp { color: #25d366; }
    .msg ::ng-deep .p-tag { font-size: .7rem; padding: .1rem .45rem; }
    .more { background: none; border: 0; padding: .25rem 0; cursor: pointer; color: var(--p-primary-600); font: inherit; font-size: .85rem; }
    .compact-empty { color: var(--fo-muted); font-size: .9rem; display: flex; align-items: center; gap: .5rem; padding: .25rem 0; }
  `,
  template: `
    @if (compact()) {
      <div class="list">
        @for (n of visible(); track n.id) {
          <div class="msg">
            <div class="txt">
              <div class="top">
                <strong>{{ 'templates.' + n.template | translate }}</strong>
                <p-tag [value]="'notificationStatus.' + n.status | translate" [severity]="severity[$any(n.status)]" />
              </div>
              <time>{{ n.createdAt | ldate: 'medium' }}</time>
              <div class="preview" dir="auto" [title]="n.body">{{ n.body }}</div>
              @if (n.error && n.status === 'FAILED') { <div class="err">{{ n.error }}</div> }
            </div>
            <i class="ch" [class]="channelIcon(n.channel)" [title]="n.channel ? ('channels.' + n.channel | translate) : ''"></i>
          </div>
        } @empty {
          <div class="compact-empty">
            @if (loading()) { <i class="pi pi-spin pi-spinner"></i> } @else { <i class="pi pi-comments"></i>{{ 'messages.empty' | translate }} }
          </div>
        }
        @if (rows().length > compactLimit) {
          <button type="button" class="more" (click)="expanded.set(!expanded())">
            {{ (expanded() ? 'messages.showLess' : 'messages.showAll') | translate: { n: rows().length } }}
          </button>
        }
      </div>
    } @else {
    @if (!bookingId()) {
      <div class="page-header">
        <div>
          <h1>{{ 'messages.title' | translate }}</h1>
          <p>{{ 'messages.subtitle' | translate }}</p>
        </div>
      </div>
    }
    <div [class.panel-flush]="!bookingId()">
      <p-table
        [value]="rows()"
        [lazy]="true"
        (onLazyLoad)="load($event)"
        [paginator]="!bookingId()"
        [rows]="30"
        [totalRecords]="total()"
        [loading]="loading()"
        dataKey="id"
      >
        <ng-template #header>
          <tr>
            <th>{{ 'messages.when' | translate }}</th>
            <th>{{ 'messages.message' | translate }}</th>
            @if (!bookingId()) { <th>{{ 'messages.to' | translate }}</th> }
            <th>{{ 'messages.channel' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
          </tr>
        </ng-template>
        <ng-template #body let-n>
          <tr>
            <td class="muted">{{ n.createdAt | ldate: 'short' }}</td>
            <td class="body">
              <strong>{{ 'templates.' + n.template | translate }}</strong>
              <div class="muted" dir="auto">{{ n.body }}</div>
              @if (n.error && n.status === 'FAILED') { <div class="err">{{ n.error }}</div> }
              @if (!bookingId() && n.bookingId) { <a [routerLink]="['/bookings', n.bookingId]">{{ 'messages.openBooking' | translate }}</a> }
            </td>
            @if (!bookingId()) { <td><span class="ltr">{{ n.toPhone | phone }}</span></td> }
            <td>{{ n.channel ? ('channels.' + n.channel | translate) : '—' }}</td>
            <td><p-tag [value]="'notificationStatus.' + n.status | translate" [severity]="severity[$any(n.status)]" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="5"><div class="empty"><i class="pi pi-comments"></i>{{ 'messages.empty' | translate }}</div></td></tr>
        </ng-template>
      </p-table>
    </div>
    }
  `,
})
export class MessagesPage implements OnInit {
  private readonly http = inject(HttpClient);

  /** When set, shows only this booking's messages (embedded mode). */
  readonly bookingId = input<string>();
  /** Card list instead of a table (booking page side column). Loads itself since there is no p-table. */
  readonly compact = input(false);

  protected readonly compactLimit = 3;
  protected readonly expanded = signal(false);
  protected readonly visible = computed(() => (this.expanded() ? this.rows() : this.rows().slice(0, this.compactLimit)));

  protected readonly severity = NOTIFICATION_SEVERITY;
  protected readonly rows = signal<NotificationLog[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);

  ngOnInit(): void {
    if (this.compact()) {
      this.load({ first: 0, rows: 30 });
    }
  }

  /** Re-fetch (used by the booking page after sending a message). */
  reload(): void {
    this.load({ first: 0, rows: 30 });
  }

  channelIcon(channel: NotificationLog['channel']): string {
    return channel === 'WHATSAPP' ? 'ch pi pi-whatsapp' : channel === 'SMS' ? 'ch pi pi-mobile' : 'ch pi pi-envelope';
  }

  load(e: TableLazyLoadEvent): void {
    const page = Math.floor((e.first ?? 0) / (e.rows ?? 30));
    const params: Record<string, string | number> = { page, size: 30 };
    if (this.bookingId()) {
      params['bookingId'] = this.bookingId()!;
    }
    this.loading.set(true);
    this.http.get<Page<NotificationLog>>('/api/v1/notifications', { params }).subscribe({
      next: (p) => {
        this.rows.set(p.items);
        this.total.set(p.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
