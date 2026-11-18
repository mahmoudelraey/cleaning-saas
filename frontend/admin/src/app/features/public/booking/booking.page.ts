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

import { PublicBooked, PublicBookingPage, PublicItem, PublicService, PublicSlot } from '../../../core/api.types';
import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatLocalDate } from '../../../shared/local-date.pipe';
import { SAUDI_MOBILE_PATTERN, SarPipe } from '../../../shared/format';
import { PlacePicker, PlaceValue } from '../../../shared/place-picker/place-picker';
import { PublicBookingApi } from '../public-booking.api';

interface Pick {
  service: PublicService;
  /** Required when the service has options (e.g. small / medium / large car). */
  optionId: string | null;
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
  styleUrl: './booking.page.scss',
  templateUrl: './booking.page.html',
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
        : [...ps, { service: s, optionId: s.options?.length === 1 ? s.options[0].id : null, quantity: s.pricingType === 'HOURLY' ? 2 : s.pricingType === 'PER_SQM' ? 100 : null, addonIds: [] }],
    );
    this.changed();
  }

  toggleAddon(p: Pick, id: string): void {
    p.addonIds = p.addonIds.includes(id) ? p.addonIds.filter((a) => a !== id) : [...p.addonIds, id];
    this.picks.update((ps) => [...ps]);
    this.changed();
  }

  pickOption(p: Pick, id: string): void {
    p.optionId = id;
    this.picks.update((ps) => [...ps]);
    this.changed();
  }

  /** Lowest option price ("from …"), or the service price without options. */
  fromPrice(s: PublicService): number {
    return s.options?.length ? Math.min(...s.options.map((o) => o.priceHalalas)) : s.basePriceHalalas;
  }

  /** True while a picked service still waits for its option. */
  protected readonly missingOption = computed(() => this.picks().some((p) => !!p.service.options?.length && !p.optionId));

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
      optionId: p.optionId,
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
    // The company's monthly bookings are used up: tell the customer to contact it (not the owner's plan wording).
    const code = (err as { error?: { code?: string } })?.error?.code;
    const summary = code === 'plan_booking_limit'
      ? this.translate.instant('publicBooking.limitReached')
      : errorMessage(err, this.translate);
    this.messages.add({ severity: 'error', summary });
  }
}

/** Today's calendar date in the company's time zone. */
function todayIn(tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
