import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';

import { NotificationLog, NotificationStatus, Page } from '../../core/api.types';
import { PhonePipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { DetailField, DetailsDialog } from '../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../shared/details-dialog/audit-block';
import { TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';

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
  imports: [DetailsDialog, CreatedBy, Button, RouterLink, TranslatePipe, TableModule, Tag, PhonePipe, LocalDatePipe],
  styleUrl: './messages.page.scss',
  templateUrl: './messages.page.html',
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
  /** Read-only details with who created / last changed the record (eye button in the table). */
  private readonly translate = inject(TranslateService);
  protected readonly viewing = signal<NotificationLog | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: NotificationLog, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: NotificationLog): DetailField[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { label: 'messages.message', value: t('templates.' + x.template) },
      { label: 'common.status', value: t('notificationStatus.' + x.status), kind: 'status', on: x.status !== 'FAILED' },
      { label: 'messages.to', value: x.toPhone, kind: 'phone' },
      { label: 'messages.channel', value: x.channel ? t('channels.' + x.channel) : null },
      { label: 'messages.when', value: x.createdAt, kind: 'datetime' },
      { label: 'messages.sentAt', value: x.sentAt ?? null, kind: 'datetime' },
      { label: 'messages.deliveredAt', value: x.deliveredAt ?? null, kind: 'datetime' },
      { label: 'messages.body', value: x.body, kind: 'multiline' },
      ...(x.error ? [{ label: 'messages.error', value: x.error, full: true }] : []),
    ];
  }

}
