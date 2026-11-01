import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputOtp } from 'primeng/inputotp';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { Subject, debounceTime, switchMap, of, catchError } from 'rxjs';

import { PublicBooked, PublicBookingPage, PublicItem, PublicService, PublicSlot } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { formatLocalDate } from '../../shared/local-date.pipe';
import { SAUDI_MOBILE_PATTERN, SarPipe } from '../../shared/format';
import { PlacePicker, PlaceValue } from '../../shared/place-picker';
import { PublicBookingApi } from './public-booking.api';

interface Pick {
  service: PublicService;
  quantity: number | null;
  addonIds: string[];
}

type Step = 'services' | 'time' | 'details' | 'done';

/**
 * The company's public booking page: /book/:slug. Mobile-first, Arabic by default. Steps: services →
 * date & time → details → phone code → done. Prices, durations and open times all come from the server.
 */
@Component({
  selector: 'app-public-booking',
  imports: [FormsModule, TranslatePipe, PlacePicker, Button, Dialog, InputNumber, InputOtp, InputText, Textarea, SarPipe],
  styles: `
    :host { display: block; min-height: 100vh; background: var(--fo-bg, #f6f7f9); }
    .wrap { max-width: 720px; margin: 0 auto; padding: 1rem 1rem 7rem; }
    .brand { display: flex; align-items: center; gap: .75rem; padding: .5rem 0 1rem; }
    .brand img { height: 48px; max-width: 140px; object-fit: contain; }
    .brand h1 { margin: 0; font-size: 1.3rem; }
    .brand .lang { margin-inline-start: auto; }
    .note { background: #fff; border: 1px solid var(--fo-border); border-radius: 12px; padding: .75rem 1rem; margin-bottom: 1rem; white-space: pre-line; }
    .steps { display: flex; gap: .4rem; margin-bottom: 1rem; }
    .steps span { flex: 1; height: 4px; border-radius: 4px; background: var(--fo-border); }
    .steps span.on { background: var(--p-primary-500); }
    h2 { font-size: 1.1rem; margin: 0 0 .75rem; }
    .svc { background: #fff; border: 1.5px solid var(--fo-border); border-radius: 14px; padding: 1rem; margin-bottom: .75rem; cursor: pointer; transition: border-color .15s; }
    .svc.on { border-color: var(--p-primary-500); box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-primary-500) 15%, transparent); }
    .svc-head { display: flex; justify-content: space-between; gap: .75rem; align-items: flex-start; }
    .svc-head strong { font-size: 1.02rem; }
    .svc p { margin: .35rem 0 0; color: var(--fo-muted); font-size: .9rem; }
    .price { white-space: nowrap; font-weight: 700; color: var(--p-primary-700); }
    .meta { color: var(--fo-muted); font-size: .82rem; margin-top: .25rem; }
    .svc-opts { margin-top: .75rem; display: grid; gap: .6rem; cursor: default; }
    .chips { display: flex; flex-wrap: wrap; gap: .5rem; }
    .chip { border: 1px solid var(--fo-border); border-radius: 999px; padding: .35rem .8rem; font-size: .88rem; background: #fff; cursor: pointer; }
    .chip.on { background: var(--p-primary-50); border-color: var(--p-primary-400); color: var(--p-primary-800); }
    .days { display: flex; gap: .5rem; overflow-x: auto; padding-bottom: .5rem; scroll-snap-type: x mandatory; }
    .day { flex: 0 0 auto; width: 64px; text-align: center; border: 1.5px solid var(--fo-border); border-radius: 12px; padding: .5rem 0; background: #fff; cursor: pointer; scroll-snap-align: start; }
    .day small { display: block; color: var(--fo-muted); font-size: .75rem; }
    .day strong { font-size: 1.15rem; }
    .day.on { border-color: var(--p-primary-500); background: var(--p-primary-50); }
    .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: .5rem; margin-top: 1rem; }
    .slot { border: 1.5px solid var(--fo-border); border-radius: 10px; padding: .6rem 0; text-align: center; background: #fff; cursor: pointer; font-variant-numeric: tabular-nums; unicode-bidi: isolate; direction: ltr; }
    .slot.on { border-color: var(--p-primary-500); background: var(--p-primary-500); color: #fff; }
    .empty { text-align: center; color: var(--fo-muted); padding: 2rem 1rem; }
    .panel { background: #fff; border: 1px solid var(--fo-border); border-radius: 14px; padding: 1rem; }
    .form { display: grid; gap: .9rem; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
    .field { display: grid; gap: .35rem; }
    .field label { font-weight: 600; font-size: .9rem; }
    .hint { color: var(--fo-muted); font-size: .8rem; }
    .bar { position: fixed; inset-inline: 0; bottom: 0; background: #fff; border-top: 1px solid var(--fo-border); padding: .75rem 1rem calc(.75rem + env(safe-area-inset-bottom)); }
    .bar-in { max-width: 720px; margin: 0 auto; display: flex; align-items: center; gap: .75rem; }
    .bar .sum { flex: 1; }
    .bar .sum strong { font-size: 1.15rem; }
    .bar .sum small { display: block; color: var(--fo-muted); }
    .summary { display: grid; gap: .35rem; margin-bottom: 1rem; }
    .summary div { display: flex; justify-content: space-between; gap: 1rem; }
    .done { text-align: center; padding: 2.5rem 1rem; }
    .done i { font-size: 3.5rem; color: var(--p-green-500); }
    .done h2 { font-size: 1.4rem; margin: 1rem 0 .5rem; }
    .otp { display: grid; justify-items: center; gap: 1rem; text-align: center; }
    .dev { background: #fff7ed; color: #9a3412; padding: .35rem .75rem; border-radius: 8px; font-size: .85rem; }
    .state { text-align: center; padding: 5rem 1rem; color: var(--fo-muted); }
    .state i { font-size: 2.5rem; display: block; margin-bottom: 1rem; }
  `,
  template: `
    @if (page(); as p) {
      <div class="wrap">
        <div class="brand">
          @if (p.logoUrl) { <img [src]="p.logoUrl" alt="" /> }
          <h1>{{ p.name }}</h1>
          <p-button class="lang" [label]="lang.current() === 'ar' ? 'English' : 'العربية'" [text]="true" size="small" (onClick)="lang.toggle()" />
        </div>
        @if (p.note && step() === 'services') { <div class="note">{{ p.note }}</div> }

        @if (step() !== 'done') {
          <div class="steps" aria-hidden="true">
            <span class="on"></span>
            <span [class.on]="step() !== 'services'"></span>
            <span [class.on]="step() === 'details'"></span>
          </div>
        }

        @switch (step()) {
          @case ('services') {
            <h2>{{ 'book.chooseServices' | translate }}</h2>
            @for (s of p.services; track s.id) {
              <div class="svc" [class.on]="isPicked(s)" (click)="toggle(s)">
                <div class="svc-head">
                  <div>
                    <strong>{{ s.name }}</strong>
                    <div class="meta">{{ unitLabel(s) | translate: { min: s.durationMin } }}</div>
                  </div>
                  <span class="price ltr">{{ s.basePriceHalalas | sar }}</span>
                </div>
                @if (s.description) { <p>{{ s.description }}</p> }
                @if (pickOf(s); as pk) {
                  <div class="svc-opts" (click)="$event.stopPropagation()">
                    @if (s.pricingType !== 'FIXED') {
                      <div class="field">
                        <label>{{ (s.pricingType === 'HOURLY' ? 'book.hours' : 'book.area') | translate }}</label>
                        <p-inputnumber [(ngModel)]="pk.quantity" (onInput)="changed()" [min]="s.pricingType === 'HOURLY' ? 1 : 1" [max]="10000"
                                       [maxFractionDigits]="s.pricingType === 'HOURLY' ? 1 : 0" [showButtons]="s.pricingType === 'HOURLY'" [useGrouping]="false" />
                      </div>
                    }
                    @if (s.addons.length) {
                      <div class="chips">
                        @for (a of s.addons; track a.id) {
                          <span class="chip" [class.on]="pk.addonIds.includes(a.id)" (click)="toggleAddon(pk, a.id)">
                            {{ a.name }} <span class="ltr">+{{ a.priceHalalas | sar }}</span>
                          </span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            } @empty {
              <div class="empty">{{ 'book.noServices' | translate }}</div>
            }
            @if (p.vatRegistered && !p.pricesIncludeVat) { <p class="hint">{{ 'book.vatNote' | translate }}</p> }
          }

          @case ('time') {
            <h2>{{ 'book.chooseTime' | translate }}</h2>
            <div class="days">
              @for (d of days(); track d.iso) {
                <div class="day" [class.on]="d.iso === date()" (click)="pickDate(d.iso)">
                  <small>{{ d.weekday }}</small>
                  <strong>{{ d.day }}</strong>
                  <small>{{ d.month }}</small>
                </div>
              }
            </div>
            @if (loadingSlots()) {
              <div class="empty"><i class="pi pi-spin pi-spinner"></i></div>
            } @else {
              <div class="slots">
                @for (s of slots(); track s.start) {
                  <div class="slot" [class.on]="s.start === slot()?.start" (click)="slot.set(s)">{{ time(s.start) }}</div>
                } @empty {
                  <div class="empty" style="grid-column: 1 / -1">{{ 'book.noSlots' | translate }}</div>
                }
              </div>
            }
            <p class="hint">{{ 'book.leadTime' | translate: { h: p.leadTimeHours } }}</p>
          }

          @case ('details') {
            <h2>{{ 'book.yourDetails' | translate }}</h2>
            <div class="panel summary">
              @for (it of quoteItems(); track $index) {
                <div><span>{{ it.description }}@if (it.quantity !== 1) { × {{ it.quantity }} }</span><span class="ltr">{{ it.totalHalalas | sar }}</span></div>
              }
              <div><strong>{{ 'book.when' | translate }}</strong><strong>{{ longDate(slot()!.start) }} · {{ time(slot()!.start) }}</strong></div>
            </div>
            <div class="panel form">
              <div class="field">
                <label for="bk-name">{{ 'book.name' | translate }}</label>
                <input pInputText id="bk-name" [(ngModel)]="name" maxlength="150" autocomplete="name" />
              </div>
              <div class="field">
                <label for="bk-phone">{{ 'book.phone' | translate }}</label>
                <input pInputText id="bk-phone" [(ngModel)]="phone" dir="ltr" inputmode="tel" placeholder="05XXXXXXXX" autocomplete="tel" />
                <span class="hint">{{ 'book.phoneHint' | translate }}</span>
              </div>
              <app-place-picker [(ngModel)]="place" idPrefix="bk" [stack]="true" />
              <div class="field">
                <label for="bk-details">{{ 'book.addressDetails' | translate }}</label>
                <input pInputText id="bk-details" [(ngModel)]="details" maxlength="300" [placeholder]="'book.addressPlaceholder' | translate" />
              </div>
              <div class="field">
                <label for="bk-map">{{ 'book.mapLink' | translate }}</label>
                <input pInputText id="bk-map" [(ngModel)]="mapUrl" dir="ltr" maxlength="500" placeholder="https://maps.app.goo.gl/…" />
              </div>
              <div class="field">
                <label for="bk-notes">{{ 'book.notes' | translate }}</label>
                <textarea pTextarea id="bk-notes" [(ngModel)]="notes" rows="2" maxlength="1000"></textarea>
              </div>
            </div>
          }

          @case ('done') {
            @if (booked(); as b) {
              <div class="panel done">
                <i class="pi pi-check-circle"></i>
                <h2>{{ 'book.doneTitle' | translate }}</h2>
                <p>{{ 'book.doneBody' | translate: { company: p.name } }}</p>
                <p><strong>{{ 'book.number' | translate }} <span class="ltr">#{{ b.number }}</span></strong></p>
                <p>{{ longDate(b.scheduledStart) }} · {{ time(b.scheduledStart) }}</p>
                @if (p.phone) {
                  <a [href]="'https://wa.me/' + p.phone.replace('+', '')" target="_blank" rel="noopener">
                    <p-button icon="pi pi-whatsapp" [label]="'doc.contact' | translate" severity="success" [outlined]="true" />
                  </a>
                }
              </div>
            }
          }
        }
      </div>

      @if (step() !== 'done') {
        <div class="bar">
          <div class="bar-in">
            @if (step() !== 'services') {
              <p-button icon="pi pi-arrow-right rtl-flip" [text]="true" severity="secondary" (onClick)="back()" [ariaLabel]="'book.back' | translate" />
            }
            <div class="sum">
              <strong class="ltr">{{ subtotal() | sar }}</strong>
              <small>{{ picks().length ? ('book.durationTotal' | translate: { min: duration() }) : ('book.pickHint' | translate) }}</small>
            </div>
            @switch (step()) {
              @case ('services') { <p-button [label]="'book.next' | translate" [disabled]="!picks().length || !quoteOk()" (onClick)="toTime()" /> }
              @case ('time') { <p-button [label]="'book.next' | translate" [disabled]="!slot()" (onClick)="step.set('details')" /> }
              @case ('details') { <p-button [label]="'book.confirm' | translate" icon="pi pi-check" [disabled]="!detailsValid()" [loading]="busy()" (onClick)="startVerify()" /> }
            }
          </div>
        </div>
      }

      <p-dialog [header]="'book.verifyTitle' | translate" [(visible)]="otpOpen" [modal]="true" [style]="{ width: '400px', maxWidth: '94vw' }" [draggable]="false">
        <div class="otp">
          <p>{{ 'book.verifyBody' | translate }} <span class="ltr">{{ phone }}</span></p>
          <p-inputotp [(ngModel)]="code" [length]="6" [integerOnly]="true" dir="ltr" />
          @if (devCode()) { <span class="dev">{{ 'book.devCode' | translate }} <span class="ltr">{{ devCode() }}</span></span> }
          <p-button [label]="'book.verifyAndBook' | translate" [disabled]="code.length !== 6" [loading]="busy()" (onClick)="verifyAndBook()" [fluid]="true" />
          <p-button [label]="resendIn() > 0 ? ('book.resendIn' | translate: { s: resendIn() }) : ('book.resend' | translate)" [text]="true" size="small" [disabled]="resendIn() > 0 || busy()" (onClick)="sendCode()" />
        </div>
      </p-dialog>
    } @else if (error()) {
      <div class="state"><i class="pi pi-calendar-times"></i>{{ error() }}</div>
    } @else {
      <div class="state"><i class="pi pi-spin pi-spinner"></i></div>
    }
  `,
})
export class BookingPage implements OnInit, OnDestroy {
  private readonly api = inject(PublicBookingApi);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  protected readonly lang = inject(LanguageService);

  readonly slug = input.required<string>();

  protected readonly page = signal<PublicBookingPage | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly step = signal<Step>('services');
  protected readonly picks = signal<Pick[]>([]);
  protected readonly subtotal = signal(0);
  protected readonly duration = signal(0);
  protected readonly quoteItems = signal<{ description: string; quantity: number; totalHalalas: number }[]>([]);
  protected readonly quoteOk = signal(false);
  protected readonly date = signal<string>('');
  protected readonly slots = signal<PublicSlot[]>([]);
  protected readonly slot = signal<PublicSlot | null>(null);
  protected readonly loadingSlots = signal(false);
  protected readonly busy = signal(false);
  protected readonly otpOpen = signal(false);
  protected readonly devCode = signal<string | null>(null);
  protected readonly resendIn = signal(0);
  protected readonly booked = signal<PublicBooked | null>(null);

  protected name = '';
  protected phone = '';
  protected place: PlaceValue = { cityId: null, districtId: null, district: null };
  protected details = '';
  protected mapUrl = '';
  protected notes = '';
  protected code = '';

  private readonly quote$ = new Subject<void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly days = computed(() => {
    const p = this.page();
    if (!p) return [];
    const locale = this.lang.current() === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
    const today = todayIn(p.timezone);
    const out: { iso: string; weekday: string; day: string; month: string }[] = [];
    for (let i = 0; i <= Math.min(p.maxDaysAhead, 30); i++) {
      const d = new Date(Date.UTC(today.y, today.m - 1, today.d + i, 12));
      out.push({
        iso: d.toISOString().slice(0, 10),
        weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d),
        day: String(d.getUTCDate()),
        month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d),
      });
    }
    return out;
  });

  ngOnInit(): void {
    this.api.page(this.slug()).subscribe({
      next: (p) => this.page.set(p),
      error: (e) =>
        this.error.set(
          e instanceof HttpErrorResponse && e.status === 404
            ? this.translate.instant('book.notFound')
            : errorMessage(e, this.translate),
        ),
    });
    this.quote$
      .pipe(
        debounceTime(200),
        switchMap(() => {
          const items = this.items();
          if (!items.length) return of(null);
          return this.api.quote(this.slug(), items).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((q) => {
        this.quoteOk.set(!!q);
        this.subtotal.set(q?.subtotalHalalas ?? 0);
        this.duration.set(q?.durationMin ?? 0);
        this.quoteItems.set(q?.items ?? []);
      });
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // services step
  isPicked(s: PublicService): boolean {
    return this.picks().some((p) => p.service.id === s.id);
  }

  pickOf(s: PublicService): Pick | undefined {
    return this.picks().find((p) => p.service.id === s.id);
  }

  toggle(s: PublicService): void {
    this.picks.update((ps) =>
      ps.some((p) => p.service.id === s.id)
        ? ps.filter((p) => p.service.id !== s.id)
        : [...ps, { service: s, quantity: s.pricingType === 'HOURLY' ? 2 : s.pricingType === 'PER_SQM' ? 100 : null, addonIds: [] }],
    );
    this.changed();
  }

  toggleAddon(p: Pick, id: string): void {
    p.addonIds = p.addonIds.includes(id) ? p.addonIds.filter((a) => a !== id) : [...p.addonIds, id];
    this.picks.update((ps) => [...ps]);
    this.changed();
  }

  changed(): void {
    this.slot.set(null);
    this.quote$.next();
  }

  unitLabel(s: PublicService): string {
    return s.pricingType === 'HOURLY' ? 'book.perHour' : s.pricingType === 'PER_SQM' ? 'book.perSqm' : 'book.duration';
  }

  toTime(): void {
    this.step.set('time');
    if (!this.date()) {
      const first = this.days()[0];
      if (first) this.pickDate(first.iso);
    } else {
      this.loadSlots();
    }
  }

  // time step
  pickDate(iso: string): void {
    this.date.set(iso);
    this.slot.set(null);
    this.loadSlots();
  }

  private loadSlots(): void {
    this.loadingSlots.set(true);
    this.api.availability(this.slug(), this.date(), this.items()).subscribe({
      next: (s) => {
        this.slots.set(s);
        this.loadingSlots.set(false);
      },
      error: (e) => {
        this.loadingSlots.set(false);
        this.toast(e);
      },
    });
  }

  back(): void {
    this.step.set(this.step() === 'details' ? 'time' : 'services');
  }

  // details + verification
  detailsValid(): boolean {
    return !!this.name.trim() && SAUDI_MOBILE_PATTERN.test(this.phone.replace(/[\s-]/g, '')) && !!this.slot();
  }

  startVerify(): void {
    this.code = '';
    this.sendCode(true);
  }

  sendCode(open = false): void {
    this.busy.set(true);
    this.api.sendCode(this.slug(), this.phone.replace(/[\s-]/g, '')).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.devCode.set(r.devCode ?? null);
        this.countdown(r.resendAfterSeconds);
        if (open) this.otpOpen.set(true);
      },
      error: (e) => {
        this.busy.set(false);
        // Code already sent a moment ago: just show the dialog to enter it.
        if (e instanceof HttpErrorResponse && e.error?.code === 'otp_cooldown' && open) {
          this.otpOpen.set(true);
          return;
        }
        this.toast(e);
      },
    });
  }

  verifyAndBook(): void {
    const phone = this.phone.replace(/[\s-]/g, '');
    this.busy.set(true);
    this.api.verify(this.slug(), phone, this.code).subscribe({
      next: (token) => {
        this.api
          .book(this.slug(), {
            sessionToken: token,
            name: this.name.trim(),
            items: this.items(),
            scheduledStart: this.slot()!.start,
            address: {
              cityId: this.place.cityId,
              districtId: this.place.districtId,
              district: this.place.district,
              details: this.details || null,
              mapUrl: this.mapUrl || null,
            },
            notes: this.notes.trim() || null,
          })
          .subscribe({
            next: (b) => {
              this.busy.set(false);
              this.otpOpen.set(false);
              this.booked.set(b);
              this.step.set('done');
            },
            error: (e) => {
              this.busy.set(false);
              this.otpOpen.set(false);
              if (e instanceof HttpErrorResponse && e.error?.code === 'slot_unavailable') {
                this.step.set('time');
                this.loadSlots();
              }
              this.toast(e);
            },
          });
      },
      error: (e) => {
        this.busy.set(false);
        this.toast(e);
      },
    });
  }

  // formatting in the company's time zone
  time(iso: string): string {
    return formatLocalDate(new Date(iso), 'time', this.lang.current(), this.page()?.timezone);
  }

  longDate(iso: string): string {
    const locale = this.lang.current() === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: this.page()?.timezone }).format(new Date(iso));
  }

  private items(): PublicItem[] {
    return this.picks().map((p) => ({
      serviceId: p.service.id,
      quantity: p.quantity ?? undefined,
      addonIds: p.addonIds,
    }));
  }

  private countdown(seconds: number): void {
    if (this.timer) clearInterval(this.timer);
    this.resendIn.set(seconds);
    this.timer = setInterval(() => {
      const left = this.resendIn() - 1;
      this.resendIn.set(Math.max(0, left));
      if (left <= 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 1000);
  }

  private toast(err: unknown): void {
    this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
  }
}

/** Today's calendar date in the company's time zone. */
function todayIn(tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
