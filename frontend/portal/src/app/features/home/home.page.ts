import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { BookingStatus, BookingSummary } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { liveRefresh } from '../../core/live-refresh';
import { PortalApi } from '../../core/portal.api';
import { serviceIcon } from '../../core/service-image';
import { VisitServicesPipe } from '../../core/service-names';
import { VisitTracker } from '../../shared/visit-tracker';
import { SessionService } from '../../core/session.service';

/**
 * The customer's own page ("My visits"): the next visit as a green card with where it stands (booked →
 * technician → done), quick actions, and the last visits. Everything comes from the customer's bookings.
 */
@Component({
  selector: 'pt-home',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, SarPipe, VisitServicesPipe, VisitTracker],
  styles: `
    :host { display: block; position: relative; overflow-x: clip;
            background:
              radial-gradient(520px 420px at 0% 10%, rgba(20, 155, 116, .10), transparent 70%),
              radial-gradient(520px 420px at 100% 90%, rgba(20, 155, 116, .10), transparent 70%),
              linear-gradient(180deg, #f3faf8 0%, #f8fbfa 100%); }
    .hm { max-width: 1200px; margin: 0 auto; padding: 22px 20px 110px; }

    /* Title */
    .title { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
    .title .ico { flex: none; width: 70px; height: 70px; border-radius: 50%; display: grid; place-items: center; background: #e2f4ee;
                  color: #0d5c46; font-size: 1.8rem; }
    .title h1 { margin: 0; font-size: clamp(1.7rem, 3.4vw, 2.3rem); font-weight: 900; color: #0f172a; }
    .title p { margin: 4px 0 0; color: #475569; }

    /* Next visit: where it stands on one side, the green card on the other */
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); background: #fff; border-radius: 28px;
            border: 1px solid rgba(226, 232, 240, .8); box-shadow: 0 24px 50px -30px rgba(13, 92, 70, .4); overflow: hidden; }
    .hero.solo { grid-template-columns: 1fr; }
    .track { padding: 30px 28px 24px; display: flex; flex-direction: column; justify-content: center; }
    .next { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 30px 34px; color: #fff; overflow: hidden;
            background: linear-gradient(135deg, #0d5c46 0%, #149b74 100%); }
    /* The soft curve where the green card meets the tracker. */
    .hero:not(.solo) .next { border-start-start-radius: 0; }
    .hero:not(.solo) .next::before { content: ''; position: absolute; top: -10%; bottom: -10%; inset-inline-start: -60px; width: 110px;
                                     border-radius: 50%; background: #fff; }
    .next > * { position: relative; z-index: 1; }
    /* Room for the curve, so no letter hides under it. */
    .hero:not(.solo) .next { padding-inline-start: 92px; }
    .next .art { position: absolute; z-index: 0; inset-inline-end: 26px; top: 50%; transform: translateY(-50%); font-size: 8.5rem;
                 color: rgba(255, 255, 255, .14); pointer-events: none; }
    .next .eyebrow { font-weight: 700; font-size: 1.15rem; opacity: .95; }
    .next .day { font-size: 1.35rem; font-weight: 800; }
    .next .time { font-size: clamp(2.6rem, 6vw, 3.6rem); font-weight: 900; line-height: 1.05; letter-spacing: -.01em; }
    .next .svc { opacity: .9; font-size: .95rem; }
    .next .row2 { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; background: #22c58b;
            color: #fff; font-weight: 800; font-size: .92rem; }
    .chip.wait { background: rgba(255, 255, 255, .2); }
    .ghost { display: inline-flex; align-items: center; gap: 10px; padding: 11px 20px; border-radius: 999px; border: 1.5px solid rgba(255, 255, 255, .85);
             color: #fff; text-decoration: none; font-weight: 700; transition: background .2s; }
    .ghost:hover { background: rgba(255, 255, 255, .12); }
    .next.none { align-items: flex-start; }
    .next.none p { margin: 0 0 8px; opacity: .9; }
    .more-up { font-size: .88rem; opacity: .9; color: #fff; }

    /* Actions */
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0 28px; }
    .act { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 60px; border-radius: 999px; font-weight: 800;
           font-size: 1.05rem; text-decoration: none; transition: transform .2s, box-shadow .2s; }
    .act:hover { transform: translateY(-1px); }
    .act.primary { background: linear-gradient(90deg, #0d5c46, #149b74); color: #fff; box-shadow: 0 14px 28px -14px rgba(13, 92, 70, .7); }
    .act.plain { background: #fff; color: #0f172a; border: 1px solid #e2e8f0; box-shadow: 0 10px 24px -18px rgba(15, 42, 61, .35); }
    .act i { font-size: 1.2rem; }
    .act.plain i { color: #0d5c46; }

    /* Recent visits */
    .sec { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 1.25rem; font-weight: 900; color: #0f172a; }
    .sec::before { content: ''; width: 5px; height: 22px; border-radius: 3px; background: #149b74; }
    .list { list-style: none; margin: 0; padding: 6px 18px; background: #fff; border-radius: 24px; border: 1px solid rgba(226, 232, 240, .8);
            box-shadow: 0 20px 40px -30px rgba(13, 92, 70, .4); }
    .list li + li { border-top: 1px solid #eef2f1; }
    .visit { display: grid; grid-template-columns: auto minmax(90px, 1fr) minmax(110px, 1fr) minmax(0, 2fr) auto auto; align-items: center;
             gap: 18px; padding: 14px 4px; color: inherit; text-decoration: none; }
    .visit:hover .go { transform: translateX(-3px); }
    :host-context([dir='ltr']) .visit:hover .go { transform: translateX(3px); }
    .v-ico { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; background: #e2f4ee; color: #0d5c46; font-size: 1.2rem; }
    .cell { line-height: 1.3; padding-inline-end: 18px; border-inline-end: 1px solid #eef2f1; min-width: 0; }
    .cell b { display: block; font-weight: 800; color: #0f172a; }
    .cell small { color: #64748b; font-size: .8rem; }
    .cell i { color: #64748b; font-size: .8rem; margin-inline-end: 4px; }
    .what { display: flex; align-items: center; gap: 10px; min-width: 0; font-weight: 700; color: #0f172a; }
    .what i { color: #0d5c46; font-size: 1.15rem; }
    .what span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; font-weight: 800; font-size: .88rem;
            white-space: nowrap; background: #f1f5f9; color: #334155; }
    .pill.ok { background: #e2f4ee; color: #0d5c46; }
    .pill.run { background: #e7f1fb; color: #1d5fa3; }
    .pill.bad { background: #fdecec; color: #b42318; }
    .go { color: #1d5fa3; transition: transform .2s; }

    .empty-list { padding: 22px; text-align: center; color: #64748b; }

    @media (max-width: 899px) {
      .hero { grid-template-columns: 1fr; }
      .hero .next { order: -1; }
      .hero:not(.solo) .next::before { display: none; }
      .hero:not(.solo) .next { padding-inline-start: 34px; }
      .visit { grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; }
      .visit .cell.amt, .visit .cell.date { display: none; }
      .what { flex-direction: column; align-items: flex-start; gap: 2px; }
      .what small { color: #64748b; font-weight: 500; font-size: .8rem; }
      .visit .go { display: none; }
    }
    @media (min-width: 900px) { .what small { display: none; } }
    @media (max-width: 599px) {
      .hm { padding: 16px 14px 110px; }
      .title .ico { width: 54px; height: 54px; font-size: 1.4rem; }
      .actions { grid-template-columns: 1fr; gap: 10px; }
      .next, .hero:not(.solo) .next { padding: 24px; }
      .next .art { font-size: 6rem; }
      .track { padding: 22px 16px; }
    }
  `,
  template: `
    <div class="hm">
      <header class="title">
        <span class="ico"><i class="pi pi-calendar" aria-hidden="true"></i></span>
        <div>
          <h1>{{ 'home.title' | translate }}</h1>
          <p>{{ 'home.subtitle' | translate: { name: firstName() } }}</p>
        </div>
      </header>

      @if (loading()) {
        <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
      } @else {
        @if (next(); as b) {
          <section class="hero" [attr.aria-label]="'home.nextVisit' | translate">
            <!-- Where the next visit stands -->
            <div class="track">
              <pt-visit-tracker [booking]="b" />
            </div>

            <!-- The visit itself -->
            <div class="next">
              <i class="pi pi-calendar-clock art" aria-hidden="true"></i>
              <span class="eyebrow">{{ (isToday(b) ? 'home.today' : 'home.nextVisit') | translate }}</span>
              <span class="day">{{ b.scheduledStart | ldate: 'day' }}</span>
              <span class="time tnum">{{ b.scheduledStart | ldate: 'time' }}</span>
              @if (b | visitServices; as names) { <span class="svc">{{ names }}</span> }
              <div class="row2">
                <span class="chip" [class.wait]="b.status === 'NEW'">
                  <i class="pi" [class]="b.status === 'NEW' ? 'pi-clock' : 'pi-check-circle'" aria-hidden="true"></i>{{ 'status.' + b.status | translate }}
                </span>
                <a class="ghost" [routerLink]="['/', slug(), 'bookings', b.id]">
                  <i class="pi pi-file" aria-hidden="true"></i>{{ 'home.viewDetails' | translate }}<i class="pi pi-arrow-left rtl-flip" aria-hidden="true"></i>
                </a>
              </div>
              @if (upcoming().length > 1) {
                <a class="more-up" [routerLink]="['/', slug(), 'bookings']">
                  {{ (upcoming().length === 2 ? 'home.moreUpcomingOne' : 'home.moreUpcoming') | translate: { n: upcoming().length - 1 } }}
                </a>
              }
            </div>
          </section>
        } @else {
          <section class="hero solo">
            <div class="next none">
              <i class="pi pi-calendar-plus art" aria-hidden="true"></i>
              <span class="day">{{ 'home.noVisits' | translate }}</span>
              <p>{{ 'home.noVisitsHint' | translate }}</p>
            </div>
          </section>
        }

        <div class="actions">
          @if (store.company()?.bookingOpen) {
            <a class="act primary" [routerLink]="['/', slug(), 'book']"><i class="pi pi-plus" aria-hidden="true"></i>{{ (next() ? 'home.bookAnother' : 'home.book') | translate }}</a>
          }
          @if (store.company()?.phone; as phone) {
            <a class="act plain" [href]="'tel:' + phone"><i class="pi pi-phone" aria-hidden="true"></i>{{ 'home.call' | translate }}</a>
          }
        </div>

        <h2 class="sec">{{ 'home.recent' | translate }}</h2>
        @if (past().length) {
          <ul class="list">
            @for (b of past(); track b.id) {
              <li>
                <a class="visit" [routerLink]="['/', slug(), 'bookings', b.id]">
                  <span class="v-ico"><i class="pi pi-home" aria-hidden="true"></i></span>
                  <span class="cell amt"><b class="ltr tnum">{{ b.subtotalHalalas | sar }}</b><small>{{ 'home.amount' | translate }}</small></span>
                  <span class="cell date"><b class="tnum"><i class="pi pi-calendar" aria-hidden="true"></i>{{ b.scheduledStart | ldate: 'dayShort' }}</b><small>{{ 'home.visitDate' | translate }}</small></span>
                  <span class="what">
                    <i class="pi" [class]="icon(b)" aria-hidden="true"></i>
                    <span>{{ (b | visitServices) || ('#' + b.number) }}</span>
                    <small class="ltr">{{ b.scheduledStart | ldate: 'dayShort' }} · {{ b.subtotalHalalas | sar }}</small>
                  </span>
                  <span class="pill" [class]="pillClass(b.status)">
                    <i class="pi" [class]="pillIcon(b.status)" aria-hidden="true"></i>{{ 'status.' + b.status | translate }}
                  </span>
                  <i class="pi pi-chevron-left rtl-flip go" aria-hidden="true"></i>
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="list empty-list">{{ 'home.noPast' | translate }}</p>
        }
      }
    </div>
  `,
})
export class HomePage implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sessions = inject(SessionService);

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

  protected icon(b: BookingSummary): string {
    return serviceIcon(b.services[0], b.servicesEn?.[0]);
  }

  protected pillClass(s: BookingStatus): string {
    if (s === 'COMPLETED') return 'pill ok';
    if (s === 'CANCELLED' || s === 'NO_SHOW') return 'pill bad';
    return 'pill run';
  }

  protected pillIcon(s: BookingStatus): string {
    if (s === 'COMPLETED') return 'pi-check-circle';
    if (s === 'CANCELLED' || s === 'NO_SHOW') return 'pi-times-circle';
    return 'pi-clock';
  }
}

