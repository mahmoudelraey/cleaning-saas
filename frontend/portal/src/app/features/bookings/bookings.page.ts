import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { BookingStatus, BookingSummary } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { serviceIcon } from '../../core/service-image';
import { VisitServicesPipe } from '../../core/service-names';
import { VisitTracker } from '../../shared/visit-tracker';

/**
 * My visits: the next visit at the top (green card with where it stands), quick actions, then all visits
 * (upcoming and past together, newest date first), each as a card with its date, service and status.
 */
@Component({
  selector: 'pt-bookings',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, VisitServicesPipe, VisitTracker],
  styles: `
    :host { display: block; position: relative; overflow-x: clip;
            background:
              radial-gradient(520px 420px at 0% 10%, rgba(20, 155, 116, .10), transparent 70%),
              radial-gradient(520px 420px at 100% 90%, rgba(20, 155, 116, .10), transparent 70%),
              linear-gradient(180deg, #f3faf8 0%, #f8fbfa 100%); }
    .bks { max-width: 1600px; margin: 0 auto; padding: 26px 20px 110px; }

    .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
    .title { display: flex; align-items: center; gap: 16px; }
    .title .ico { flex: none; width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center; background: #e2f4ee;
                  color: #0d5c46; font-size: 1.7rem; }
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

    /* Actions */
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0 30px; }
    .act { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 60px; border-radius: 999px; font-weight: 800;
           font-size: 1.05rem; text-decoration: none; transition: transform .2s, box-shadow .2s; }
    .act:hover { transform: translateY(-1px); }
    .act.primary { background: linear-gradient(90deg, #0d5c46, #149b74); color: #fff; box-shadow: 0 14px 28px -14px rgba(13, 92, 70, .7); }
    .act.plain { background: #fff; color: #0f172a; border: 1px solid #e2e8f0; box-shadow: 0 10px 24px -18px rgba(15, 42, 61, .35); }
    .act i { font-size: 1.2rem; }
    .act.plain i { color: #0d5c46; }

    .sec { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 1.25rem; font-weight: 900; color: #0f172a; }
    .sec::before { content: ''; width: 5px; height: 22px; border-radius: 3px; background: #149b74; }

    /* Visits */
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .card { display: flex; align-items: center; gap: 18px; padding: 14px 18px 14px 14px; border-radius: 24px; background: #fff;
            color: inherit; text-decoration: none; border: 1px solid rgba(226, 232, 240, .8);
            box-shadow: 0 18px 36px -28px rgba(13, 92, 70, .45); transition: transform .2s, box-shadow .2s; }
    :host-context([dir='rtl']) .card { padding: 14px 14px 14px 18px; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 22px 40px -26px rgba(13, 92, 70, .5); }
    .date { flex: none; width: 104px; padding: 12px 0; border-radius: 18px; background: #eef8f4; text-align: center; line-height: 1.15; }
    .date b { display: block; font-size: 2rem; font-weight: 900; color: #0f172a; }
    .date small { color: #475569; font-weight: 600; }
    .sep { width: 1px; align-self: stretch; margin: 8px 0; background: #e8eef0; }
    .svc-ico { flex: none; width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: #e2f4ee; color: #0d5c46; font-size: 1.25rem; }
    .what { flex: 1; min-width: 0; line-height: 1.4; }
    .what b { display: block; font-size: 1.12rem; font-weight: 900; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .what small { color: #64748b; font-size: .9rem; }
    .pill { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 999px; font-weight: 800; font-size: .9rem;
            white-space: nowrap; background: #e2f4ee; color: #0d5c46; }
    .pill.wait { background: #fff6e0; color: #92610a; }
    .pill.run { background: #e7f1fb; color: #1d5fa3; }
    .pill.bad { background: #fdecec; color: #b42318; }
    .pill.muted { background: #f1f5f9; color: #334155; }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 20px; text-align: center; border-radius: 24px;
             background: #fff; border: 1px solid rgba(226, 232, 240, .8); color: #475569; }
    .empty > i { font-size: 2rem; color: #149b74; width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: #e2f4ee; }
    .empty p { margin: 0; }

    @media (max-width: 899px) {
      .hero { grid-template-columns: 1fr; }
      .hero .next { order: -1; }
      .hero:not(.solo) .next::before { display: none; }
      .hero:not(.solo) .next { padding-inline-start: 34px; }
    }
    @media (max-width: 599px) {
      .actions { grid-template-columns: 1fr; gap: 10px; }
      .next, .hero:not(.solo) .next { padding: 24px; }
      .next .art { font-size: 6rem; }
      .track { padding: 22px 16px; }
    }
    @media (max-width: 640px) {
      .bks { padding: 18px 14px 110px; }
      .title .ico { width: 54px; height: 54px; font-size: 1.35rem; }
      .card { flex-wrap: wrap; gap: 12px; }
      .date { width: 76px; padding: 8px 0; }
      .date b { font-size: 1.5rem; }
      .sep, .svc-ico { display: none; }
      .pill { margin-inline-start: auto; padding: 8px 14px; font-size: .82rem; }
      .card .pill { flex-basis: 100%; justify-content: center; }
    }
  `,
  template: `
    <div class="bks">
      <div class="head">
        <div class="title">
          <span class="ico"><i class="pi pi-calendar" aria-hidden="true"></i></span>
          <div>
            <h1>{{ 'home.title' | translate }}</h1>
            <p>{{ 'home.subtitle' | translate }}</p>
          </div>
        </div>
      </div>

      <!-- The next visit first (as on the old "My page"), then the quick actions. -->
      @if (upcoming() === null) {
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
      }

      <h2 class="sec">{{ 'home.allVisits' | translate }}</h2>
      @if (loading()) {
        <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (rows().length) {
        <ul class="list">
          @for (b of rows(); track b.id) {
            <li>
              <a class="card" [routerLink]="['/', store.slug(), 'bookings', b.id]">
                <span class="date"><b class="tnum">{{ b.scheduledStart | ldate: 'dayNum' }}</b><small>{{ b.scheduledStart | ldate: 'month' }}</small></span>
                <span class="svc-ico"><i class="pi" [class]="icon(b)" aria-hidden="true"></i></span>
                <span class="what">
                  <b>{{ (b | visitServices) || ('#' + b.number) }}</b>
                  <small>{{ b.scheduledStart | ldate: 'weekday' }} {{ b.scheduledStart | ldate: 'time' }}</small>
                </span>
                <span class="sep" aria-hidden="true"></span>
                <span class="pill" [class]="pillClass(b.status)">
                  <i class="pi" [class]="pillIcon(b.status)" aria-hidden="true"></i>{{ 'status.' + b.status | translate }}
                </span>
              </a>
            </li>
          }
        </ul>
      } @else {
        <div class="empty">
          <i class="pi pi-calendar" aria-hidden="true"></i>
          <p>{{ 'home.noVisitsAtAll' | translate }}</p>
        </div>
      }
    </div>
  `,
})
export class BookingsPage implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);

  protected readonly slug = this.store.slug;
  /** Every visit, newest date first. */
  protected readonly rows = signal<BookingSummary[]>([]);
  protected readonly loading = signal(true);
  /** Upcoming visits, for the card at the top (null while loading). */
  protected readonly upcoming = signal<BookingSummary[] | null>(null);

  /**
   * The first visit still ahead: its end time hasn't passed. One the technician is on the way to or working on may
   * run over, so it stays for up to 12 hours after its end time (same rule as the server's "upcoming").
   */
  protected readonly next = computed(() => {
    const now = Date.now();
    const grace = 12 * 60 * 60 * 1000;
    return (
      (this.upcoming() ?? []).find((b) => {
        const end = new Date(b.scheduledEnd || b.scheduledStart).getTime();
        const working = b.status === 'ON_THE_WAY' || b.status === 'IN_PROGRESS';
        return end > now || (working && end > now - grace);
      }) ?? null
    );
  });

  ngOnInit(): void {
    const slug = this.store.slug();
    forkJoin({ up: this.api.bookings(slug, 'upcoming'), past: this.api.bookings(slug, 'past') }).subscribe({
      next: ({ up, past }) => {
        this.upcoming.set(up);
        const all = [...up, ...past].sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
        this.rows.set(all);
        this.loading.set(false);
      },
      error: () => {
        this.upcoming.set([]);
        this.loading.set(false);
      },
    });
  }

  protected isToday(b: BookingSummary): boolean {
    return new Date(b.scheduledStart).toDateString() === new Date().toDateString();
  }

  protected icon(b: BookingSummary): string {
    return serviceIcon(b.services[0], b.servicesEn?.[0]);
  }

  protected pillClass(s: BookingStatus): string {
    switch (s) {
      case 'NEW':
        return 'pill wait';
      case 'ON_THE_WAY':
      case 'IN_PROGRESS':
        return 'pill run';
      case 'CANCELLED':
      case 'NO_SHOW':
        return 'pill bad';
      default:
        return 'pill'; // confirmed, technician assigned, completed
    }
  }

  protected pillIcon(s: BookingStatus): string {
    switch (s) {
      case 'NEW':
        return 'pi-clock';
      case 'ON_THE_WAY':
        return 'pi-car';
      case 'IN_PROGRESS':
        return 'pi-spinner';
      case 'CANCELLED':
      case 'NO_SHOW':
        return 'pi-times-circle';
      default:
        return 'pi-check-circle';
    }
  }
}
