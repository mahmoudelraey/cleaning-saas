import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { BookingSummary } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { liveRefresh } from '../../core/live-refresh';
import { PortalApi } from '../../core/portal.api';
import { SessionService } from '../../core/session.service';
import { VisitServicesPipe } from '../../core/service-names';
import { StatusRail } from '../../shared/status-rail';

@Component({
  selector: 'pt-home',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, SarPipe, StatusRail, VisitServicesPipe],
  styles: `
    .hello { font-size: 1.05rem; color: var(--ink-2); margin: 4px 0 14px; }
    .hello strong { color: var(--ink); }

    /* The one bold element: the next visit as a ticket, perforated between "when" and "where it stands". */
    .ticket { position: relative; display: block; color: #fff; text-decoration: none; border-radius: var(--r-lg);
              background: linear-gradient(160deg, var(--tide) 0%, var(--tide-deep) 100%); box-shadow: var(--shadow); }
    .ticket .top { padding: 22px 22px 18px; }
    .ticket .eyebrow { font-size: .88rem; opacity: .8; }
    .ticket .day { font-size: 1.25rem; font-weight: 700; margin-top: 2px; }
    .ticket .time { font-size: clamp(2.6rem, 11vw, 3.4rem); font-weight: 700; line-height: 1.05; margin-top: 6px;
                    letter-spacing: -.01em; }
    .ticket .svc { margin-top: 10px; opacity: .9; font-size: .95rem; }
    .ticket .cut { position: relative; height: 0; border-top: 2px dashed rgba(255, 255, 255, .35); margin: 0 18px; }
    .ticket .cut::before, .ticket .cut::after { content: ''; position: absolute; top: -13px; width: 24px; height: 24px;
                    border-radius: 50%; background: var(--mist); }
    .ticket .cut::before { inset-inline-start: -30px; }
    .ticket .cut::after { inset-inline-end: -30px; }
    .ticket .bottom { padding: 16px 22px 20px; }
    .ticket .who { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: .92rem; }
    .ticket .dot { width: 10px; height: 10px; border-radius: 50%; background: #fff; }
    .ticket.none { background: var(--surface); color: var(--ink); box-shadow: none; text-align: center; padding: 28px 22px; }
    .ticket.none i { font-size: 1.6rem; color: var(--tide); }
    .ticket.none p { color: var(--ink-2); margin: 8px 0 18px; }

    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    .more { font-size: .9rem; color: var(--ink-2); margin-top: 10px; text-align: center; }
    .row .when { width: 52px; flex: none; text-align: center; line-height: 1.1; }
    .row .when b { display: block; font-size: 1.3rem; }
    .row .when small { color: var(--ink-3); font-size: .78rem; }
    .row .txt { flex: 1; min-width: 0; }
    .row .txt div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
    .row .txt small { color: var(--ink-2); }
  `,
  template: `
    <div class="page">
      <p class="hello">{{ 'home.hello' | translate }} <strong>{{ firstName() }}</strong></p>

      @if (loading()) {
        <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
      } @else {
        @if (next(); as b) {
          <a class="ticket" [routerLink]="['/', slug(), 'bookings', b.id]">
            <div class="top">
              <div class="eyebrow">{{ (isToday(b) ? 'home.today' : 'home.nextVisit') | translate }}</div>
              <div class="day">{{ b.scheduledStart | ldate: 'day' }}</div>
              <div class="time tnum">{{ b.scheduledStart | ldate: 'time' }}</div>
              <div class="svc">{{ b | visitServices }}</div>
            </div>
            <div class="cut" aria-hidden="true"></div>
            <div class="bottom">
              <pt-status-rail class="light" [status]="b.status" />
              @if (b.technicians.length) {
                <div class="who"><span class="dot"></span>{{ 'home.technician' | translate: { name: techNames(b) } }}</div>
              }
            </div>
          </a>
          @if (upcoming().length > 1) {
            <div class="more">
              <a [routerLink]="['/', slug(), 'bookings']">{{ (upcoming().length === 2 ? 'home.moreUpcomingOne' : 'home.moreUpcoming') | translate: { n: upcoming().length - 1 } }}</a>
            </div>
          }
        } @else {
          <div class="ticket none">
            <i class="pi pi-calendar-plus"></i>
            <h2 style="font-size:1.15rem; margin-top:10px">{{ 'home.noVisits' | translate }}</h2>
            <p>{{ 'home.noVisitsHint' | translate }}</p>
            @if (store.company()?.bookingOpen) {
              <a class="btn btn-primary" [routerLink]="['/', slug(), 'book']"><i class="pi pi-plus"></i>{{ 'home.book' | translate }}</a>
            }
          </div>
        }

        <div class="actions">
          @if (store.company()?.bookingOpen && next()) {
            <a class="btn btn-primary" [routerLink]="['/', slug(), 'book']"><i class="pi pi-plus"></i>{{ 'home.bookAnother' | translate }}</a>
          }
          @if (store.company()?.phone; as phone) {
            <a class="btn btn-quiet" [href]="'tel:' + phone"><i class="pi pi-phone"></i>{{ 'home.call' | translate }}</a>
          }
        </div>

        @if (past().length) {
          <h2 class="section-title">{{ 'home.recent' | translate }}</h2>
          <div class="rows">
            @for (b of past(); track b.id) {
              <a class="row" [routerLink]="['/', slug(), 'bookings', b.id]">
                <span class="when"><b class="tnum">{{ b.scheduledStart | ldate: 'dayNum' }}</b><small>{{ b.scheduledStart | ldate: 'month' }}</small></span>
                <span class="txt">
                  <div>{{ (b | visitServices) || ('#' + b.number) }}</div>
                  <small class="ltr">{{ b.subtotalHalalas | sar }}</small>
                </span>
                <span class="status" [class]="'status s-' + b.status">{{ 'status.' + b.status | translate }}</span>
              </a>
            }
          </div>
        }
      }
    </div>
  `,
})
export class HomePage implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly slug = this.store.slug;
  protected readonly loading = signal(true);
  protected readonly upcoming = signal<BookingSummary[]>([]);
  protected readonly past = signal<BookingSummary[]>([]);
  protected readonly next = computed(() => this.upcoming()[0] ?? null);
  protected readonly firstName = computed(() => (this.sessions.get(this.slug())?.name ?? '').trim().split(/\s+/)[0]);

  ngOnInit(): void {
    this.load();
    liveRefresh(this.destroyRef, () => this.load());
  }

  private load(): void {
    forkJoin({ up: this.api.bookings(this.slug(), 'upcoming'), past: this.api.bookings(this.slug(), 'past') }).subscribe({
      next: ({ up, past }) => {
        this.upcoming.set(up);
        this.past.set(past.slice(0, 3));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected isToday(b: BookingSummary): boolean {
    return new Date(b.scheduledStart).toDateString() === new Date().toDateString();
  }

  protected techNames(b: BookingSummary): string {
    return b.technicians.map((t) => t.name).join('، ');
  }
}
