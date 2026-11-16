import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { AppDialog } from '../../../shared/dialog/dialog';
import { Menu } from 'primeng/menu';
import { MultiSelect } from 'primeng/multiselect';
import { Textarea } from 'primeng/textarea';

import { BookingDetail, BookingStatus, InvoiceSummary, NotificationLog, Page, Technician, VisitEvent } from '../../../core/api.types';
import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../core/http/api-error';
import { STATUS_COLOR } from '../../../shared/booking-status/booking-status';
import { InvoiceStatusTag } from '../../../shared/document-status/document-status';
import { BillingApi } from '../../billing/billing.api';
import { PhonePipe, SarPipe } from '../../../shared/format';
import { BookingsApi } from '../bookings.api';
import { PhotoGallery } from '../../field/photo-gallery/photo-gallery';
import { MessagesPage } from '../../messages/messages.page';
import { LocalDatePipe, LocalTimeRangePipe, formatLocalDate } from '../../../shared/local-date.pipe';
import { LanguageService } from '../../../core/i18n/language.service';
import { TenantService } from '../../../core/tenant.service';
import { LockedFeature } from '../../../shared/locked-feature/locked-feature';
import { doesAnyService } from '../../../shared/technician-services';

/** Button style per target status. */
const ACTION_STYLE: Partial<Record<BookingStatus, { icon: string; severity: 'primary' | 'secondary' | 'danger' | 'success' | 'warn' | 'info' }>> = {
  CONFIRMED: { icon: 'pi pi-check', severity: 'primary' },
  ON_THE_WAY: { icon: 'pi pi-car', severity: 'primary' },
  IN_PROGRESS: { icon: 'pi pi-play', severity: 'primary' },
  COMPLETED: { icon: 'pi pi-check-circle', severity: 'success' },
  NO_SHOW: { icon: 'pi pi-user-minus', severity: 'danger' },
  CANCELLED: { icon: 'pi pi-times', severity: 'danger' },
};

/** The happy path of a visit, in the order the state machine walks it. */
const FLOW: BookingStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];
const STEP_ICON: Record<BookingStatus, string> = {
  NEW: 'pi pi-plus-circle',
  CONFIRMED: 'pi pi-verified',
  ASSIGNED: 'pi pi-user',
  ON_THE_WAY: 'pi pi-car',
  IN_PROGRESS: 'pi pi-play',
  COMPLETED: 'pi pi-flag',
  CANCELLED: 'pi pi-times',
  NO_SHOW: 'pi pi-user-minus',
};
const DESTRUCTIVE: BookingStatus[] = ['CANCELLED', 'NO_SHOW'];

type LogFilter = 'all' | 'activity' | 'notes' | 'messages';

/** One row of the full log dialog: a visit event or a message sent to the customer. */
interface LogEntry {
  id: string;
  at: string;
  group: Exclude<LogFilter, 'all'>;
  icon: string;
  tone: string;
  title: string;
  actor: string;
  from?: BookingStatus;
  to?: BookingStatus;
  text?: string;
  textLabel?: string;
  quote?: boolean;
  channel?: NotificationLog['channel'];
  msgStatus?: NotificationLog['status'];
}

const TONE = {
  teal: 'var(--p-teal-600)',
  blue: 'var(--p-blue-600)',
  green: 'var(--p-green-600)',
  red: 'var(--p-red-600)',
  amber: 'var(--p-amber-600)',
  violet: 'var(--p-violet-600)',
  gray: 'var(--p-slate-500)',
};

interface JourneyStep {
  status: BookingStatus;
  state: 'done' | 'current' | 'pending' | 'failed';
  icon: string;
  at?: string;
  detail?: string;
}

@Component({
  selector: 'app-booking-detail',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, AppDialog, Menu, MultiSelect, Textarea, LocalDatePipe, LocalTimeRangePipe, PhonePipe, SarPipe, InvoiceStatusTag, PhotoGallery, MessagesPage, LockedFeature],
  styleUrl: './booking-detail.page.scss',
  templateUrl: './booking-detail.page.html',
})
export class BookingDetailPage implements OnInit {
  private readonly api = inject(BookingsApi);
  private readonly billing = inject(BillingApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  protected readonly tenants = inject(TenantService);
  protected readonly isOffice = inject(AuthService).hasRole('OWNER', 'COORDINATOR');

  readonly id = input.required<string>();

  protected readonly booking = signal<BookingDetail | null>(null);
  protected readonly technicians = signal<Technician[]>([]);
  protected readonly freeTechIds = signal<Set<string> | null>(null);
  protected readonly busy = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly logOpen = signal(false);
  protected readonly logFilter = signal<LogFilter>('all');
  protected readonly logFilters: LogFilter[] = ['all', 'activity', 'notes', 'messages'];
  protected readonly customerMessages = signal<NotificationLog[]>([]);
  protected readonly noteOpen = signal(false);
  protected readonly messageOpen = signal(false);
  protected readonly messageSending = signal(false);
  protected readonly messageMax = 500;
  protected messageText = '';
  private readonly bookingMessages = viewChild<MessagesPage>('bookingMessages');
  protected selectedTechs: string[] = [];
  protected cancelReason = '';
  protected note = '';

  protected readonly invoices = signal<InvoiceSummary[]>([]);
  protected readonly billingBusy = signal(false);
  private readonly authz = inject(AuthService);
  /** Coordinators need the Quotes screen to create a quote from a booking. */
  protected readonly canQuote = this.authz.canSee('QUOTES');
  protected readonly canInvoice = computed(
    () =>
      this.authz.canSee('INVOICES') &&
      !['CANCELLED', 'NO_SHOW'].includes(this.booking()?.status ?? '') &&
      !this.invoices().some((i) => i.status !== 'VOID'),
  );
  /** Never offer ASSIGNED → CONFIRMED as a status step: that removes the technician ("Remove technician" does it). */
  protected readonly transitions = computed(() => {
    const b = this.booking();
    const list = b?.allowedTransitions ?? [];
    return b?.status === 'ASSIGNED' ? list.filter((t) => t !== 'CONFIRMED') : list;
  });
  /** The one forward step shown as the main button; everything else goes in "More". */
  protected readonly primaryAction = computed(() => this.transitions().find((t) => !DESTRUCTIVE.includes(t)) ?? null);
  protected readonly editable = computed(() => ['NEW', 'CONFIRMED', 'ASSIGNED'].includes(this.booking()?.status ?? ''));
  protected readonly canAssign = computed(() => ['NEW', 'CONFIRMED', 'ASSIGNED'].includes(this.booking()?.status ?? ''));
  protected readonly techNames = computed(() => (this.booking()?.technicians ?? []).map((t) => t.name).join('، '));
  protected readonly noteEvents = computed(() => (this.booking()?.events ?? []).filter((e) => e.type === 'NOTE' && e.note));
  protected readonly hasNotes = computed(() => {
    const b = this.booking();
    return !!b && (!!b.notes || !!b.cancelReason || (!!b.internalNotes && this.isOffice) || this.noteEvents().length > 0);
  });

  protected readonly moreItems = computed<MenuItem[]>(() => {
    const b = this.booking();
    if (!b) {
      return [];
    }
    // Re-read on language change so menu labels follow the UI language.
    const t = (k: string) => this.translate.instant(k);
    const items: MenuItem[] = [];
    if (this.isOffice && this.canAssign() && b.technicians.length) {
      items.push({ label: t('bookings.reassign'), icon: 'pi pi-users', command: () => this.openAssign() });
    }
    if (this.isOffice && b.status === 'ASSIGNED') {
      items.push({ label: t('bookings.unassign'), icon: 'pi pi-user-minus', command: () => this.unassign() });
    }
    const primary = this.primaryAction();
    for (const s of this.transitions().filter((x) => x !== primary && !DESTRUCTIVE.includes(x))) {
      items.push({ label: t('bookingAction.' + s), icon: this.style(s).icon, command: () => this.move(s) });
    }
    const destructive = this.transitions().filter((x) => DESTRUCTIVE.includes(x));
    if (destructive.length && items.length) {
      items.push({ separator: true });
    }
    for (const s of destructive) {
      items.push({ label: t('bookingAction.' + s), icon: this.style(s).icon, styleClass: 'menu-danger', command: () => this.move(s) });
    }
    return items;
  });

  protected readonly log = computed<LogEntry[]>(() => {
    const b = this.booking();
    if (!b) {
      return [];
    }
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    const createdByCustomer = b.events.some((e) => e.type === 'CREATED' && (e.note === 'booking_page' || e.note === 'portal'));
    const actorOf = (e: VisitEvent) =>
      e.actorName
        ? t('bookingDetail.log.by', { name: e.actorName })
        : t(e.type === 'CREATED' && createdByCustomer ? 'bookingDetail.log.byCustomer' : 'bookingDetail.log.bySystem');

    const entries: LogEntry[] = b.events.map((e): LogEntry => {
      const base = { id: e.id, at: e.at, actor: actorOf(e) };
      switch (e.type) {
        case 'CREATED':
          return { ...base, group: 'activity', icon: 'pi pi-plus-circle', tone: TONE.teal, to: e.toStatus,
                   title: t(e.note === 'booking_page' ? 'events.CREATED_PUBLIC' : e.note === 'portal' ? 'events.CREATED_PORTAL' : 'events.CREATED') };
        case 'STATUS_CHANGED': {
          const bad = e.toStatus === 'CANCELLED' || e.toStatus === 'NO_SHOW';
          return { ...base, group: 'activity', icon: STEP_ICON[e.toStatus ?? 'CONFIRMED'],
                   tone: bad ? TONE.red : e.toStatus === 'COMPLETED' ? TONE.green : TONE.blue,
                   title: t('bookingDetail.log.statusChanged'), from: e.fromStatus, to: e.toStatus,
                   text: e.note, textLabel: e.note ? t('bookingDetail.log.reason') : undefined, quote: true };
        }
        case 'ASSIGNED':
          return { ...base, group: 'activity', icon: 'pi pi-user-plus', tone: TONE.violet,
                   title: t('bookingDetail.log.assigned'), text: e.note, textLabel: t('bookings.technicians') };
        case 'UNASSIGNED':
          return { ...base, group: 'activity', icon: 'pi pi-user-minus', tone: TONE.amber,
                   title: t('events.UNASSIGNED'), from: e.fromStatus, to: e.toStatus };
        case 'RESCHEDULED':
          return { ...base, group: 'activity', icon: 'pi pi-calendar', tone: TONE.amber, title: t('events.RESCHEDULED'),
                   text: `${t('bookingDetail.log.newTime')}: ${this.fmt(b.scheduledStart)}` };
        case 'UPDATED':
          return { ...base, group: 'activity', icon: 'pi pi-pencil', tone: TONE.gray, title: t('events.UPDATED') };
        case 'NOTE':
          return { ...base, group: 'notes', icon: 'pi pi-comment', tone: TONE.amber, title: t('events.NOTE'), text: e.note, quote: true };
        case 'PHOTO_ADDED':
          return { ...base, group: 'notes', icon: 'pi pi-camera', tone: TONE.gray,
                   title: t('bookingDetail.log.photo', { kind: e.note === 'BEFORE' || e.note === 'AFTER' ? t('photos.' + e.note) : '' }) };
        case 'INVOICE_ISSUED':
          return { ...base, group: 'activity', icon: 'pi pi-receipt', tone: TONE.green, title: t('events.INVOICE_ISSUED', { note: e.note ?? '' }) };
        default:
          return { ...base, group: 'activity', icon: 'pi pi-circle', tone: TONE.gray, title: t('events.' + e.type) };
      }
    });

    for (const m of this.customerMessages()) {
      entries.push({
        id: 'msg-' + m.id,
        at: m.createdAt,
        group: 'messages',
        icon: m.channel === 'WHATSAPP' ? 'pi pi-whatsapp' : 'pi pi-envelope',
        tone: m.status === 'FAILED' ? TONE.red : TONE.green,
        title: `${t('bookingDetail.log.message')}: ${t('templates.' + m.template)}`,
        actor: t('bookingDetail.log.toCustomer', { phone: new PhonePipe().transform(m.toPhone) }),
        text: m.status === 'FAILED' && m.error ? `${m.body}\n⚠ ${m.error}` : m.body,
        quote: true,
        channel: m.channel,
        msgStatus: m.status,
      });
    }
    return entries.sort((a, z) => new Date(a.at).getTime() - new Date(z.at).getTime());
  });
  protected readonly filteredLog = computed(() => {
    const f = this.logFilter();
    return f === 'all' ? this.log() : this.log().filter((e) => e.group === f);
  });
  protected readonly logCounts = computed(() => {
    const counts: Record<LogFilter, number> = { all: 0, activity: 0, notes: 0, messages: 0 };
    for (const e of this.log()) {
      counts.all++;
      counts[e.group]++;
    }
    return counts;
  });

  /** Visit progress: the happy path, cut short by a cancellation or no-show. */
  protected readonly journey = computed<JourneyStep[]>(() => {
    const b = this.booking();
    if (!b) {
      return [];
    }
    const lastEvent = (pred: (e: VisitEvent) => boolean) => [...b.events].reverse().find(pred);
    const reachedAt = (s: BookingStatus) => lastEvent((e) => e.type === 'STATUS_CHANGED' && e.toStatus === s);
    const failed = DESTRUCTIVE.includes(b.status);
    // Furthest point on the happy path the visit got to (for cancelled visits, the status it was in before).
    let rank = FLOW.indexOf(b.status);
    if (failed) {
      const ended = reachedAt(b.status);
      rank = ended?.fromStatus ? FLOW.indexOf(ended.fromStatus) : 0;
    }

    const steps: JourneyStep[] = [];
    FLOW.forEach((status, i) => {
      if (failed && i > rank) {
        return;
      }
      let at: string | undefined;
      let detail: string | undefined;
      if (status === 'NEW') {
        const created = lastEvent((e) => e.type === 'CREATED');
        at = created?.at ?? b.createdAt;
        detail = this.translate.instant(
          created?.note === 'booking_page' ? 'events.CREATED_PUBLIC' : created?.note === 'portal' ? 'events.CREATED_PORTAL' : 'bookingDetail.stepDone.NEW',
        );
      } else if (status === 'ASSIGNED') {
        const ev = lastEvent((e) => e.type === 'ASSIGNED');
        at = reachedAt('ASSIGNED')?.at ?? ev?.at;
        const names = ev?.note || this.techNames();
        detail = names ? this.translate.instant('bookingDetail.stepDone.ASSIGNED', { names }) : undefined;
      } else if (status === 'CONFIRMED' && !reachedAt('CONFIRMED')) {
        // Bookings made from the dashboard start out confirmed.
        const created = lastEvent((e) => e.type === 'CREATED' && e.toStatus === 'CONFIRMED');
        at = created?.at;
        detail = this.translate.instant(created ? 'bookingDetail.stepDone.CONFIRMED_ON_CREATE' : 'bookingDetail.stepDone.CONFIRMED');
      } else {
        at = reachedAt(status)?.at;
        detail = this.translate.instant('bookingDetail.stepDone.' + status);
      }
      const state: JourneyStep['state'] = i < rank || (i === rank && (status === 'COMPLETED' || failed)) ? 'done' : i === rank ? 'current' : 'pending';
      steps.push({ status, state, icon: STEP_ICON[status], at: state === 'pending' ? undefined : at, detail: state === 'pending' ? undefined : detail });
    });
    if (failed) {
      const ended = reachedAt(b.status);
      steps.push({ status: b.status, state: 'failed', icon: STEP_ICON[b.status], at: ended?.at, detail: b.cancelReason || ended?.note });
    }
    return steps;
  });

  protected readonly technicianOptions = computed(() => {
    const free = this.freeTechIds();
    const current = new Set(this.booking()?.technicians.map((t) => t.id) ?? []);
    const wanted = new Set((this.booking()?.items ?? []).map((i) => i.serviceId).filter((id): id is string => !!id));
    return this.technicians()
      .filter((t) => current.has(t.id) || (t.active && doesAnyService(t, wanted)))
      .map((t) => ({
        value: t.id,
        label:
          free === null || current.has(t.id)
            ? t.name
            : `${t.name} — ${this.translate.instant(free.has(t.id) ? 'bookings.free' : 'bookings.busy')}`,
      }));
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    if (this.isOffice) {
      // Only when the plan has invoicing (otherwise the API answers feature_not_in_plan).
      this.tenants.ensureLoaded().subscribe({
        next: () => {
          if (this.tenants.has('quotes_invoices')) {
            this.billing.bookingInvoices(this.id()).subscribe({ next: (i) => this.invoices.set(i), error: () => {} });
          }
        },
        error: () => {},
      });
    }
    this.api.get(this.id()).subscribe({
      next: (b) => this.booking.set(b),
      error: (err) => {
        this.toast(err);
        void this.router.navigate([this.isOffice ? '/bookings' : '/dashboard']);
      },
    });
  }

  openMessage(): void {
    this.messageText = '';
    this.messageOpen.set(true);
  }

  /** Same wording the server sends (NotificationTemplate.CUSTOM_MESSAGE), one line. */
  protected messagePreview(): string {
    const b = this.booking();
    const first = (b?.customerName ?? '').trim().split(/\s+/)[0] ?? '';
    const company = this.tenants.tenant()?.name ?? '';
    return `مرحباً ${first}، رسالة من ${company}: ${this.messageText.trim().replace(/\s*\n\s*/g, ' ')}`;
  }

  sendMessage(): void {
    const text = this.messageText.trim();
    if (!text) {
      return;
    }
    this.messageSending.set(true);
    this.api.sendMessage(this.id(), text).subscribe({
      next: () => {
        this.messageSending.set(false);
        this.messageOpen.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('bookingDetail.messageQueued') });
        // The outbox sends within seconds; show the queued row now and its delivery status shortly after.
        this.bookingMessages()?.reload();
        setTimeout(() => this.bookingMessages()?.reload(), 5000);
      },
      error: (e) => {
        this.messageSending.set(false);
        this.toast(e);
      },
    });
  }

  openLog(): void {
    this.logFilter.set('all');
    this.logOpen.set(true);
    if (this.isOffice) {
      this.http
        .get<Page<NotificationLog>>('/api/v1/notifications', { params: { bookingId: this.id(), page: 0, size: 100 } })
        .subscribe({ next: (p) => this.customerMessages.set(p.items), error: () => {} });
    }
  }

  private fmt(iso: string): string {
    return formatLocalDate(new Date(iso), 'medium', this.lang.current());
  }

  style(t: BookingStatus) {
    return ACTION_STYLE[t] ?? { icon: 'pi pi-arrow-right', severity: 'secondary' as const };
  }

  color(s: BookingStatus): string {
    return STATUS_COLOR[s];
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]).join('');
  }

  waLink(phone: string): string {
    return 'https://wa.me/' + phone.replace('+', '');
  }

  move(target: BookingStatus): void {
    if (target === 'CANCELLED') {
      this.cancelReason = '';
      this.cancelOpen.set(true);
      return;
    }
    if (target === 'NO_SHOW') {
      this.confirm.confirm({
        message: this.translate.instant('bookings.confirmNoShow'),
        acceptLabel: this.translate.instant('bookingAction.NO_SHOW'),
        rejectLabel: this.translate.instant('common.cancel'),
        acceptButtonProps: { severity: 'danger' },
        accept: () => this.doMove(target),
      });
      return;
    }
    this.doMove(target);
  }

  doMove(target: BookingStatus, reason?: string): void {
    this.busy.set(true);
    this.api.changeStatus(this.id(), target, reason || undefined).subscribe({
      next: (b) => {
        this.booking.set(b);
        this.busy.set(false);
        this.cancelOpen.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast(err);
      },
    });
  }

  openAssign(): void {
    const b = this.booking();
    if (!b) {
      return;
    }
    this.selectedTechs = b.technicians.map((t) => t.id);
    this.http.get<Technician[]>('/api/v1/technicians').subscribe((t) => this.technicians.set(t));
    const start = new Date(b.scheduledStart);
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const minutes = Math.round((new Date(b.scheduledEnd).getTime() - start.getTime()) / 60000);
    this.api.availability(date, minutes).subscribe({
      next: (slots) => {
        const slot = slots.find((s) => new Date(s.start).getTime() === start.getTime());
        this.freeTechIds.set(new Set(slot?.freeTechnicianIds ?? []));
      },
      error: () => this.freeTechIds.set(null),
    });
    this.assignOpen.set(true);
  }

  assign(force: boolean): void {
    this.busy.set(true);
    this.api.assign(this.id(), this.selectedTechs, force).subscribe({
      next: (b) => {
        this.booking.set(b);
        this.busy.set(false);
        this.assignOpen.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        if (err instanceof HttpErrorResponse && err.error?.code === 'outside_work_hours' && !force) {
          this.confirm.confirm({
            message: `${errorMessage(err, this.translate)}. ${this.translate.instant('bookings.forceQuestion')}`,
            acceptLabel: this.translate.instant('bookings.forceYes'),
            rejectLabel: this.translate.instant('common.cancel'),
            accept: () => this.assign(true),
          });
          return;
        }
        this.toast(err);
      },
    });
  }

  unassign(): void {
    this.api.unassign(this.id()).subscribe({ next: (b) => this.booking.set(b), error: (e) => this.toast(e) });
  }

  addNote(): void {
    const text = this.note.trim();
    if (!text) {
      return;
    }
    this.api.addNote(this.id(), text).subscribe({
      next: () => {
        this.note = '';
        this.noteOpen.set(false);
        this.reload();
      },
      error: (e) => this.toast(e),
    });
  }

  issueInvoice(): void {
    this.confirm.confirm({
      message: this.translate.instant('invoices.issueConfirm'),
      acceptLabel: this.translate.instant('invoices.issue'),
      rejectLabel: this.translate.instant('common.cancel'),
      accept: () => {
        this.billingBusy.set(true);
        this.billing.issueForBooking(this.id(), { send: true }).subscribe({
          next: (inv) => {
            this.billingBusy.set(false);
            void this.router.navigate(['/invoices', inv.id]);
          },
          error: (e) => {
            this.billingBusy.set(false);
            this.toast(e);
          },
        });
      },
    });
  }

  createQuote(): void {
    this.billingBusy.set(true);
    this.billing.quoteForBooking(this.id()).subscribe({
      next: (q) => {
        this.billingBusy.set(false);
        void this.router.navigate(['/quotes', q.id]);
      },
      error: (e) => {
        this.billingBusy.set(false);
        this.toast(e);
      },
    });
  }

  private toast(err: unknown): void {
    this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
  }
}
