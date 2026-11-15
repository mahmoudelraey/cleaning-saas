import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';

import { ContactInboxService, ContactMessage, ContactTopic } from '../../../core/contact-inbox.service';
import { errorMessage } from '../../../core/http/api-error';
import { TenantService } from '../../../core/tenant.service';
import { PhonePipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

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
  styleUrl: './contact-requests.page.scss',
  templateUrl: './contact-requests.page.html',
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
