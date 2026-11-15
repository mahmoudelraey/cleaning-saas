import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ContactTopic } from '../../../core/api.types';
import { CompanyStore } from '../../../core/company.store';
import { errorMessage } from '../../../core/errors';
import { PhonePipe, SAUDI_MOBILE } from '../../../core/format';
import { PortalApi } from '../../../core/portal.api';
import { SessionService } from '../../../core/session.service';
import { socialLinks } from '../../../core/socials';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS: ContactTopic[] = ['BOOKING', 'QUESTION', 'QUOTE', 'COMPLAINT', 'OTHER'];

/** Contact us: how to reach the company right now, and a message form that lands in the office's inbox. */
@Component({
  selector: 'pt-contact',
  imports: [FormsModule, RouterLink, TranslatePipe, PhonePipe],
  styleUrls: ['../company.page.scss', './contact.page.scss'],
  templateUrl: './contact.page.html',
})
export class ContactPage {
  private readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);

  protected readonly slug = this.store.slug;
  protected readonly company = this.store.company;
  protected readonly page = computed(() => this.company()?.page ?? {});
  protected readonly topics = TOPICS;

  protected readonly topic = signal<ContactTopic>(this.initialTopic());
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  // Signed-in customers don't retype who they are.
  private readonly session = this.sessions.get(this.slug());
  protected name = this.session?.name ?? '';
  protected phone = this.localPhone(this.session?.phone);
  protected email = '';
  protected message = '';
  protected website = '';

  protected readonly whatsappUrl = computed(() => {
    const n = this.page().whatsapp?.replace(/\D/g, '');
    return n ? `https://wa.me/${n}` : null;
  });
  protected readonly socials = computed(() => socialLinks(this.page()));

  protected mapUrl(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  protected send(): void {
    const phone = this.phone.replace(/[\s-]/g, '');
    if (!this.name.trim()) return this.error.set(this.translate.instant('register.nameRequired'));
    if (!SAUDI_MOBILE.test(phone)) return this.error.set(this.translate.instant('errors.invalid_phone'));
    if (this.email.trim() && !EMAIL.test(this.email.trim())) return this.error.set(this.translate.instant('register.badEmail'));
    if (this.message.trim().length < 5) return this.error.set(this.translate.instant('contact.messageRequired'));
    this.busy.set(true);
    this.error.set(null);
    this.api
      .contact(this.slug(), {
        name: this.name.trim(),
        phone,
        email: this.email.trim() || null,
        topic: this.topic(),
        message: this.message.trim(),
        website: this.website,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.sent.set(true);
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(errorMessage(e, this.translate));
        },
      });
  }

  protected reset(): void {
    this.message = '';
    this.sent.set(false);
  }

  /** ?topic=quote (or booking, complaint, ...) preselects the subject. */
  private initialTopic(): ContactTopic {
    const t = (this.route.snapshot.queryParamMap.get('topic') ?? '').toUpperCase() as ContactTopic;
    return TOPICS.includes(t) ? t : 'QUESTION';
  }

  /** +966551234567 → 0551234567 for the input. */
  private localPhone(e164?: string): string {
    if (!e164) return '';
    const m = /^\+966(5\d{8})$/.exec(e164);
    return m ? `0${m[1]}` : e164;
  }
}
