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

/**
 * "Contact us" as a section of the company page (#contact): a message form that lands in the office's inbox,
 * and the ways to reach the company right now.
 */
@Component({
  selector: 'pt-contact-section',
  imports: [FormsModule, RouterLink, TranslatePipe, PhonePipe],
  styleUrls: ['./public-section.scss'],
  styles: `
    .contact-grid { display: grid; gap: 28px; align-items: start; }
    @media (min-width: 960px) { .contact-grid { grid-template-columns: 1.5fr 1fr; } }

    form { display: grid; gap: 18px; }
    .topics { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .topics legend { padding: 0; margin-bottom: 10px; font-weight: 800; font-size: .88rem; color: #334155; }
    .chip { position: relative; padding: 9px 18px; border-radius: 12px; font-size: .85rem; font-weight: 700; cursor: pointer;
            background: #fff; color: #475569; border: 1px solid var(--slate-2); transition: all .2s; }
    .chip:hover { background: #f1f5f9; }
    .chip input { position: absolute; opacity: 0; pointer-events: none; }
    .chip.on { background: var(--b600); color: #fff; border-color: var(--b600); box-shadow: 0 4px 10px -4px rgba(13, 92, 70, .5); }
    .chip:focus-within { outline: 3px solid rgba(20, 155, 116, .35); outline-offset: 2px; }

    .two { display: grid; gap: 18px; }
    @media (min-width: 620px) { .two { grid-template-columns: 1fr 1fr; } }
    .fld { display: flex; flex-direction: column; gap: 8px; }
    .fld label { font-weight: 800; font-size: .85rem; color: #334155; }
    .opt { color: #94a3b8; font-weight: 500; font-size: .8rem; }
    .in { width: 100%; box-sizing: border-box; padding: 13px 16px; border-radius: 14px; border: 1px solid var(--slate-2);
          background: #f8fafc; font: inherit; font-size: .95rem; color: #0f172a; transition: border-color .2s, box-shadow .2s, background .2s; }
    .in::placeholder { color: #94a3b8; }
    .in:focus { outline: none; background: #fff; border-color: var(--b500); box-shadow: 0 0 0 4px rgba(20, 155, 116, .15); }
    textarea.in { resize: vertical; min-height: 130px; line-height: 1.8; }
    .count { align-self: flex-end; color: #94a3b8; font-size: .75rem; }
    .hp { position: absolute; inset-inline-start: -10000px; width: 1px; height: 1px; overflow: hidden; }
    .err { margin: 0; padding: 10px 14px; border-radius: 12px; background: #fef2f2; color: #b91c1c; font-size: .88rem; font-weight: 600; }
    .send { width: 100%; padding: 16px; }
    .fine { margin: 0; text-align: center; font-size: .78rem; color: #94a3b8; }

    .sent { text-align: center; padding: 24px 4px; }
    .sent h3 { font-size: 1.35rem; font-weight: 900; margin: 16px 0 8px; }
    .sent p { margin: 0 auto 22px; max-width: 40ch; color: #475569; }
    .ok { width: 72px; height: 72px; border-radius: 22px; margin: 0 auto; display: grid; place-items: center;
          background: var(--b600); color: #fff; font-size: 1.6rem; box-shadow: 0 10px 15px -3px rgba(13, 92, 70, .3); }
    .row-btns { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }

    .reach { display: flex; flex-direction: column; gap: 10px; }
    .crow { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 16px; background: #f8fafc;
            border: 1px solid var(--slate-2); color: inherit; text-decoration: none; transition: border-color .2s, background .2s; }
    a.crow:hover { border-color: var(--b200); background: var(--b50); }
    .crow span { display: flex; flex-direction: column; min-width: 0; }
    .crow strong { font-size: .88rem; font-weight: 800; }
    .crow small { color: var(--slate-5); font-size: .8rem; }
    .ico { flex: none; width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: #fff;
           color: var(--b600); box-shadow: 0 1px 2px rgba(15, 23, 42, .06); }
    .ico.wa { color: #10b981; }
    .muted { margin: 0; color: var(--slate-5); }

    .socials { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .socials a { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 12px; background: #fff;
                 border: 1px solid var(--slate-2); color: #334155; font-size: .82rem; font-weight: 700; text-decoration: none; }
    .socials a:hover { color: var(--b600); border-color: var(--b200); }
    .side-book { width: 100%; margin-top: 20px; box-sizing: border-box; }
  `,
  template: `
    @if (company(); as c) {
      <section class="band" aria-labelledby="h-contact">
        <div class="wrap">
          <header class="sec-head">
            <span class="kicker">{{ 'company.contact' | translate }}</span>
            <h2 id="h-contact">{{ 'contact.heading' | translate }}</h2>
            <p>{{ 'contact.lead' | translate: { name: companyName() } }}</p>
          </header>

          <div class="contact-grid">
            <!-- the form -->
            <div class="panel">
              @if (sent()) {
                <div class="sent" role="status">
                  <span class="ok"><i class="pi pi-check" aria-hidden="true"></i></span>
                  <h3>{{ 'contact.sentTitle' | translate }}</h3>
                  <p>{{ 'contact.sentLead' | translate: { name: companyName() } }}</p>
                  <div class="row-btns">
                    <button type="button" class="btn-soft" (click)="reset()">{{ 'contact.another' | translate }}</button>
                    @if (c.bookingOpen) {
                      <a class="btn-main" [routerLink]="['/', slug(), 'book']"><i class="pi pi-calendar-plus gold" aria-hidden="true"></i>{{ 'company.bookNow' | translate }}</a>
                    }
                  </div>
                </div>
              } @else {
                <div class="panel-head">
                  <span class="p-ico"><i class="pi pi-envelope" aria-hidden="true"></i></span>
                  <h3>{{ 'contact.formTitle' | translate }}</h3>
                </div>
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
                    <div class="fld">
                      <label for="ct-name">{{ 'register.name' | translate }}</label>
                      <input id="ct-name" class="in" name="name" [(ngModel)]="name" autocomplete="name" maxlength="150" required />
                    </div>
                    <div class="fld">
                      <label for="ct-phone">{{ 'login.phone' | translate }}</label>
                      <input id="ct-phone" class="in ltr" name="phone" [(ngModel)]="phone" inputmode="tel" autocomplete="tel-national"
                             placeholder="05XXXXXXXX" maxlength="14" required />
                    </div>
                  </div>
                  <div class="fld">
                    <label for="ct-email">{{ 'register.email' | translate }} <span class="opt">{{ 'register.optional' | translate }}</span></label>
                    <input id="ct-email" class="in ltr" name="email" type="email" [(ngModel)]="email" autocomplete="email" maxlength="200" />
                  </div>
                  <div class="fld">
                    <label for="ct-msg">{{ 'contact.message' | translate }}</label>
                    <textarea id="ct-msg" class="in" name="message" [(ngModel)]="message" rows="5" maxlength="2000"
                              [placeholder]="'contact.messagePlaceholder' | translate" required></textarea>
                    <small class="count tnum">{{ message.length }}/2000</small>
                  </div>
                  <!-- Honeypot for bots: hidden from people and screen readers. -->
                  <div class="hp" aria-hidden="true">
                    <label for="ct-web">Website</label>
                    <input id="ct-web" name="website" [(ngModel)]="website" tabindex="-1" autocomplete="off" />
                  </div>
                  @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
                  <button class="btn-main send" [disabled]="busy()">
                    <i class="pi pi-send rtl-flip" aria-hidden="true"></i>{{ 'contact.send' | translate }}
                  </button>
                  <p class="fine">{{ 'contact.privacy' | translate }}</p>
                </form>
              }
            </div>

            <!-- reach us now -->
            <aside class="panel">
              <div class="panel-head">
                <span class="p-ico"><i class="pi pi-phone" aria-hidden="true"></i></span>
                <h3>{{ 'contact.reach' | translate }}</h3>
              </div>
              <div class="reach">
                @if (whatsappUrl(); as wa) {
                  <a class="crow" [href]="wa" target="_blank" rel="noopener">
                    <i class="pi pi-whatsapp ico wa" aria-hidden="true"></i>
                    <span><strong>{{ 'company.whatsapp' | translate }}</strong><small class="ltr">{{ page().whatsapp | phone }}</small></span>
                  </a>
                }
                @if (c.phone) {
                  <a class="crow" [href]="'tel:' + c.phone">
                    <i class="pi pi-phone ico" aria-hidden="true"></i>
                    <span><strong>{{ 'company.call' | translate }}</strong><small class="ltr">{{ c.phone | phone }}</small></span>
                  </a>
                }
                @if (c.address) {
                  <a class="crow" [href]="mapUrl(c.address)" target="_blank" rel="noopener">
                    <i class="pi pi-map-marker ico" aria-hidden="true"></i>
                    <span><strong>{{ 'company.address' | translate }}</strong><small>{{ c.address }}</small></span>
                  </a>
                }
                @if (page().hours) {
                  <div class="crow">
                    <i class="pi pi-clock ico" aria-hidden="true"></i>
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
                    <li><a [href]="s.url" target="_blank" rel="noopener">@if (s.icon) { <i class="pi" [class]="s.icon" aria-hidden="true"></i> }<span>{{ s.label }}</span></a></li>
                  }
                </ul>
              }
              @if (c.bookingOpen) {
                <a class="btn-main side-book" [routerLink]="['/', slug(), 'book']">
                  <i class="pi pi-calendar-plus gold" aria-hidden="true"></i>{{ 'company.bookNow' | translate }}
                </a>
              }
            </aside>
          </div>
        </div>
      </section>
    }
  `,
})
export class ContactSection {
  private readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);

  protected readonly slug = this.store.slug;
  protected readonly companyName = this.store.name;
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
