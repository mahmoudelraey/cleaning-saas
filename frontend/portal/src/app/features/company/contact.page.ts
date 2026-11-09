import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ContactTopic } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { PhonePipe, SAUDI_MOBILE } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { SessionService } from '../../core/session.service';
import { socialLinks } from '../../core/socials';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS: ContactTopic[] = ['BOOKING', 'QUESTION', 'QUOTE', 'COMPLAINT', 'OTHER'];

/** Contact us: how to reach the company right now, and a message form that lands in the office's inbox. */
@Component({
  selector: 'pt-contact',
  imports: [FormsModule, RouterLink, TranslatePipe, PhonePipe],
  styleUrls: ['./company.page.scss', './contact.page.scss'],
  template: `
    @if (company(); as c) {
      <section class="hero about-hero">
        <div class="hero-in">
          <h1>{{ 'contact.title' | translate }}</h1>
          <p class="lead">{{ 'contact.lead' | translate: { name: c.name } }}</p>
        </div>
        <svg class="waterline" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,70 C220,20 420,10 640,48 C860,86 1020,104 1220,78 C1320,64 1390,50 1440,44 L1440,120 L0,120 Z" />
        </svg>
      </section>

      <main class="content wide">
        <div class="grid">
          <!-- the form -->
          <section class="card pad" aria-labelledby="h-form">
            @if (sent()) {
              <div class="sent">
                <span class="ok"><i class="pi pi-check" aria-hidden="true"></i></span>
                <h2 id="h-form">{{ 'contact.sentTitle' | translate }}</h2>
                <p class="muted">{{ 'contact.sentLead' | translate: { name: c.name } }}</p>
                <div class="row-btns">
                  <button type="button" class="btn btn-quiet" (click)="reset()">{{ 'contact.another' | translate }}</button>
                  <a class="btn btn-primary" [routerLink]="['/', slug()]">{{ 'contact.backHome' | translate }}</a>
                </div>
              </div>
            } @else {
              <header class="card-head flat">
                <span class="head-ico"><i class="pi pi-envelope" aria-hidden="true"></i></span>
                <h2 id="h-form">{{ 'contact.formTitle' | translate }}</h2>
              </header>
              <form (ngSubmit)="send()" novalidate>
                <fieldset class="topics">
                  <legend>{{ 'contact.topic' | translate }}</legend>
                  @for (t of topics; track t) {
                    <label class="chip" [class.on]="topic() === t">
                      <input type="radio" name="topic" [value]="t" [checked]="topic() === t" (change)="topic.set(t)" />
                      {{ 'contact.topics.' + t | translate }}
                    </label>
                  }
                </fieldset>
                <div class="two">
                  <div class="field">
                    <label for="ct-name">{{ 'register.name' | translate }}</label>
                    <input id="ct-name" class="input" name="name" [(ngModel)]="name" autocomplete="name" maxlength="150" required />
                  </div>
                  <div class="field">
                    <label for="ct-phone">{{ 'login.phone' | translate }}</label>
                    <input id="ct-phone" class="input ltr" style="display:block; width:100%" name="phone" [(ngModel)]="phone"
                           inputmode="tel" autocomplete="tel-national" placeholder="05XXXXXXXX" maxlength="14" required />
                  </div>
                </div>
                <div class="field">
                  <label for="ct-email">{{ 'register.email' | translate }} <span class="opt">{{ 'register.optional' | translate }}</span></label>
                  <input id="ct-email" class="input ltr" style="display:block; width:100%" name="email" type="email"
                         [(ngModel)]="email" autocomplete="email" maxlength="200" />
                </div>
                <div class="field">
                  <label for="ct-msg">{{ 'contact.message' | translate }}</label>
                  <textarea id="ct-msg" class="input" name="message" [(ngModel)]="message" rows="5" maxlength="2000"
                            [placeholder]="'contact.messagePlaceholder' | translate" required></textarea>
                  <small class="count tnum">{{ message.length }}/2000</small>
                </div>
                <!-- Honeypot for bots: hidden from people and screen readers. -->
                <div class="hp" aria-hidden="true">
                  <label for="ct-web">Website</label>
                  <input id="ct-web" name="website" [(ngModel)]="website" tabindex="-1" autocomplete="off" />
                </div>
                @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
                <button class="btn btn-primary btn-block" [disabled]="busy()">
                  <i class="pi pi-send rtl-flip" aria-hidden="true"></i>{{ 'contact.send' | translate }}
                </button>
                <p class="fine">{{ 'contact.privacy' | translate }}</p>
              </form>
            }
          </section>

          <!-- reach us now -->
          <aside class="card pad side" aria-labelledby="h-reach">
            <header class="card-head flat">
              <span class="head-ico"><i class="pi pi-phone" aria-hidden="true"></i></span>
              <h2 id="h-reach">{{ 'contact.reach' | translate }}</h2>
            </header>
            <div class="contact">
              @if (whatsappUrl(); as wa) {
                <a class="crow" [href]="wa" target="_blank" rel="noopener">
                  <i class="pi pi-whatsapp ico wa"></i>
                  <span><strong>{{ 'company.whatsapp' | translate }}</strong><small>{{ page().whatsapp | phone }}</small></span>
                </a>
              }
              @if (c.phone) {
                <a class="crow" [href]="'tel:' + c.phone">
                  <i class="pi pi-phone ico"></i>
                  <span><strong>{{ 'company.call' | translate }}</strong><small>{{ c.phone | phone }}</small></span>
                </a>
              }
              @if (c.address) {
                <a class="crow" [href]="mapUrl(c.address)" target="_blank" rel="noopener">
                  <i class="pi pi-map-marker ico"></i>
                  <span><strong>{{ 'company.address' | translate }}</strong><small>{{ c.address }}</small></span>
                </a>
              }
              @if (page().hours) {
                <div class="crow">
                  <i class="pi pi-clock ico"></i>
                  <span><strong>{{ 'company.hoursLabel' | translate }}</strong><small>{{ page().hours }}</small></span>
                </div>
              }
              @if (!whatsappUrl() && !c.phone && !c.address && !page().hours) {
                <p class="muted">{{ 'contact.formOnly' | translate }}</p>
              }
            </div>
            @if (socials().length) {
              <ul class="socials">
                @for (s of socials(); track s.label) {
                  <li><a [href]="s.url" target="_blank" rel="noopener">@if (s.icon) { <i class="pi" [class]="s.icon"></i> }<span>{{ s.label }}</span></a></li>
                }
              </ul>
            }
            @if (c.bookingOpen) {
              <a class="btn-book side-book" [routerLink]="['/', slug(), 'book']">
                <i class="pi pi-calendar" aria-hidden="true"></i>
                <span>{{ 'company.book' | translate }}</span>
                <span class="go-circle" aria-hidden="true"><i class="pi pi-chevron-left rtl-flip"></i></span>
              </a>
            }
          </aside>
        </div>
      </main>
    } @else {
      <div class="loading"><div class="spinner" aria-hidden="true"></div></div>
    }
  `,
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
