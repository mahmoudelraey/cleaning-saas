import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';

import { ContactInboxService, ContactMessage, ContactTopic } from '../../core/contact-inbox.service';
import { errorMessage } from '../../core/http/api-error';
import { TenantService } from '../../core/tenant.service';
import { PhonePipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';

type Filter = 'NEW' | 'DONE' | 'ALL';

const TOPIC_ICON: Record<ContactTopic, string> = {
  BOOKING: 'pi pi-calendar',
  QUESTION: 'pi pi-question-circle',
  QUOTE: 'pi pi-file-edit',
  COMPLAINT: 'pi pi-exclamation-triangle',
  OTHER: 'pi pi-envelope',
};

/** "Contact us" messages from the customer portal: reply by phone or WhatsApp, then mark them handled. */
@Component({
  selector: 'app-contact-requests',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, SelectButton, PhonePipe, LocalDatePipe],
  styles: `
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; margin-bottom: .9rem; }
    .list { display: flex; flex-direction: column; gap: .7rem; }
    .msg { display: grid; grid-template-columns: auto 1fr; gap: .9rem; }
    .msg.new { border-inline-start: 3px solid #f0a92e; }
    .msg.complaint { border-inline-start-color: var(--p-red-500); }
    .topic-ico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--fo-bg);
                 color: var(--p-primary-600); }
    .complaint .topic-ico { color: var(--p-red-500); }
    .top { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .75rem; }
    .top strong { font-size: 1rem; }
    .tag { font-size: .75rem; padding: .1rem .55rem; border-radius: 999px; background: var(--fo-bg); color: var(--fo-muted); }
    .tag.new { background: #fdf1da; color: #8a5a07; font-weight: 600; }
    .meta { font-size: .8rem; color: var(--fo-muted); }
    .text { margin: .5rem 0 .75rem; white-space: pre-line; line-height: 1.7; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
    .actions a { text-decoration: none; }
    .done-note { font-size: .8rem; color: var(--fo-muted); margin-inline-start: auto; }
    .empty { text-align: center; color: var(--fo-muted); padding: 3rem 1rem; }
    .empty i { font-size: 2rem; display: block; margin-bottom: .5rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'contactRequests.title' | translate }}</h1>
        <p>{{ 'contactRequests.subtitle' | translate }}</p>
      </div>
      <a [href]="tenants.portalUrl() + '/contact'" target="_blank" rel="noopener">
        <p-button icon="pi pi-external-link" [label]="'contactRequests.viewPage' | translate" [outlined]="true" />
      </a>
    </div>

    <div class="toolbar">
      <p-selectbutton [options]="filters()" [(ngModel)]="filter" (onChange)="load()" optionLabel="label" optionValue="value" [allowEmpty]="false" />
      @if (inbox.newCount() > 0) {
        <span class="muted">{{ 'contactRequests.waiting' | translate: { n: inbox.newCount() } }}</span>
      }
    </div>

    @if (loading()) {
      <div class="empty"><i class="pi pi-spin pi-spinner"></i></div>
    } @else {
      <div class="list">
        @for (m of rows(); track m.id) {
          <div class="panel msg" [class.new]="m.status === 'NEW'" [class.complaint]="m.topic === 'COMPLAINT'">
            <span class="topic-ico"><i [class]="icon(m.topic)"></i></span>
            <div>
              <div class="top">
                <strong>{{ m.name }}</strong>
                <span class="tag" [class.new]="m.status === 'NEW'">{{ 'contactRequests.topics.' + m.topic | translate }}</span>
                @if (m.customerId) {
                  <a class="meta" [routerLink]="['/customers', m.customerId]"><i class="pi pi-user"></i> {{ 'contactRequests.customer' | translate }}</a>
                }
                <span class="meta">{{ m.createdAt | ldate: 'medium' }}</span>
              </div>
              <div class="meta"><span class="ltr">{{ m.phone | phone }}</span>@if (m.email) { · <span class="ltr">{{ m.email }}</span> }</div>
              <p class="text" dir="auto">{{ m.message }}</p>
              <div class="actions">
                <a [href]="whatsapp(m)" target="_blank" rel="noopener"><p-button icon="pi pi-whatsapp" [label]="'contactRequests.whatsapp' | translate" size="small" severity="success" [outlined]="true" /></a>
                <a [href]="'tel:' + m.phone"><p-button icon="pi pi-phone" [label]="'contactRequests.call' | translate" size="small" [outlined]="true" /></a>
                @if (m.email) {
                  <a [href]="'mailto:' + m.email"><p-button icon="pi pi-envelope" [label]="'contactRequests.email' | translate" size="small" [text]="true" /></a>
                }
                @if (m.status === 'NEW') {
                  <p-button icon="pi pi-check" [label]="'contactRequests.markDone' | translate" size="small" [loading]="busy() === m.id" (onClick)="setDone(m, true)" />
                } @else {
                  <span class="done-note">{{ 'contactRequests.handled' | translate }} @if (m.handledAt) { · {{ m.handledAt | ldate: 'medium' }} }</span>
                  <p-button icon="pi pi-undo" [label]="'contactRequests.reopen' | translate" size="small" [text]="true" [loading]="busy() === m.id" (onClick)="setDone(m, false)" />
                }
              </div>
            </div>
          </div>
        } @empty {
          <div class="panel empty">
            <i class="pi pi-envelope"></i>
            <strong>{{ (filter === 'NEW' ? 'contactRequests.emptyNew' : 'contactRequests.empty') | translate }}</strong>
            <p>{{ 'contactRequests.emptyHint' | translate }}</p>
          </div>
        }
      </div>
    }
  `,
})
export class ContactRequestsPage implements OnInit {
  protected readonly inbox = inject(ContactInboxService);
  protected readonly tenants = inject(TenantService);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected filter: Filter = 'NEW';
  protected readonly rows = signal<ContactMessage[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal<string | null>(null);
  protected readonly filters = computed(() => [
    { label: this.translate.instant('contactRequests.filter.NEW'), value: 'NEW' },
    { label: this.translate.instant('contactRequests.filter.DONE'), value: 'DONE' },
    { label: this.translate.instant('contactRequests.filter.ALL'), value: 'ALL' },
  ]);

  ngOnInit(): void {
    this.tenants.ensureLoaded().subscribe({ error: () => {} });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.inbox.list(this.filter === 'ALL' ? null : this.filter).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
    this.inbox.refreshCount();
  }

  protected icon(t: ContactTopic): string {
    return TOPIC_ICON[t] ?? TOPIC_ICON.OTHER;
  }

  protected whatsapp(m: ContactMessage): string {
    const text = this.translate.instant('contactRequests.waText', { name: m.name.split(/\s+/)[0], company: this.tenants.tenant()?.name ?? '' });
    return `https://wa.me/${m.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
  }

  protected setDone(m: ContactMessage, done: boolean): void {
    this.busy.set(m.id);
    this.inbox.setDone(m.id, done).subscribe({
      next: (u) => {
        this.busy.set(null);
        // Leave the list it no longer belongs to (NEW ↔ DONE); in "All" just update it.
        this.rows.update((l) => (this.filter === 'ALL' ? l.map((x) => (x.id === u.id ? u : x)) : l.filter((x) => x.id !== u.id)));
        this.messages.add({ severity: 'success', summary: this.translate.instant(done ? 'contactRequests.doneToast' : 'contactRequests.reopenedToast') });
      },
      error: (e) => {
        this.busy.set(null);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }
}
