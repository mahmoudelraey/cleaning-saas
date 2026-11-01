import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Menu } from 'primeng/menu';
import { MultiSelect } from 'primeng/multiselect';
import { Textarea } from 'primeng/textarea';

import { BookingDetail, BookingStatus, InvoiceSummary, NotificationLog, Page, Technician, VisitEvent } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { STATUS_COLOR } from '../../shared/booking-status';
import { InvoiceStatusTag } from '../../shared/document-status';
import { BillingApi } from '../billing/billing.api';
import { PhonePipe, SarPipe } from '../../shared/format';
import { BookingsApi } from './bookings.api';
import { PhotoGallery } from '../field/photo-gallery';
import { MessagesPage } from '../messages/messages.page';
import { LocalDatePipe, LocalTimeRangePipe, formatLocalDate } from '../../shared/local-date.pipe';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantService } from '../../core/tenant.service';
import { LockedFeature } from '../../shared/locked-feature';

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
  imports: [FormsModule, RouterLink, TranslatePipe, Button, Dialog, Menu, MultiSelect, Textarea, LocalDatePipe, LocalTimeRangePipe, PhonePipe, SarPipe, InvoiceStatusTag, PhotoGallery, MessagesPage, LockedFeature],
  styles: `
    :host { display: block; container-type: inline-size; }

    /* ---------- breadcrumb ---------- */
    .crumbs { display: flex; align-items: center; gap: .5rem; color: var(--fo-muted); font-size: .9rem; margin-block-end: 1rem; }
    .crumbs a { color: var(--fo-muted); text-decoration: none; }
    .crumbs a:hover { color: var(--p-primary-600); }
    .crumbs i { font-size: .75rem; }
    .crumbs span { color: var(--fo-text); }

    /* ---------- cards ---------- */
    .card { background: var(--fo-surface); border: 1px solid var(--fo-border); border-radius: var(--fo-radius); padding: 1.25rem; }
    .card-h { display: flex; align-items: center; gap: .6rem; margin: 0 0 1rem; }
    .card-h h2 { font-size: 1.05rem; font-weight: 700; margin: 0; flex: 1; }
    .card-h > i { font-size: 1.1rem; color: var(--fo-text); }
    .card-h .link { font-size: .85rem; text-decoration: none; background: none; border: 0; cursor: pointer; color: var(--p-primary-600); font: inherit; padding: 0; }

    /* ---------- header ---------- */
    .hero { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; margin-block-end: 1.25rem; padding: 1.25rem 1.5rem; }
    .hero-title { flex: 1 1 260px; min-width: 0; }
    .hero-title h1 { margin: 0; font-size: 1.75rem; font-weight: 800; display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
    .hero-title p { margin: .35rem 0 0; color: var(--fo-muted); font-size: .9rem; }
    .meta { display: flex; gap: 1.75rem; flex-wrap: wrap; }
    .meta-item { display: flex; align-items: center; gap: .6rem; }
    .meta-item > i { font-size: 1.35rem; color: var(--fo-muted); }
    .meta-item small { display: block; color: var(--fo-muted); font-size: .78rem; }
    .meta-item strong { font-weight: 600; font-size: .92rem; }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; }

    .status-chip { display: inline-flex; align-items: center; gap: .45rem; font-size: .82rem; font-weight: 600; padding: .3rem .75rem;
                   border-radius: 999px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); white-space: nowrap; }
    .status-chip::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
    .hero-title .status-chip { font-size: .85rem; }

    /* ---------- three-column layout (RTL: journey on the right, customer on the left) ---------- */
    .layout { display: grid; gap: 1.25rem; align-items: start;
              grid-template-columns: minmax(250px, 290px) minmax(0, 1.35fr) minmax(0, 1fr); grid-template-areas: 'journey main side'; }
    .col { display: flex; flex-direction: column; gap: 1.25rem; min-width: 0; }
    .col-journey { grid-area: journey; }
    .col-main { grid-area: main; }
    .col-side { grid-area: side; }
    /* Sized by the page's own width (not the window), so the sidebar is accounted for.
       Medium: the timeline keeps a narrow column on the start side, everything else stacks next to it. */
    @container (max-width: 1150px) {
      .layout { grid-template-columns: minmax(240px, 280px) minmax(0, 1fr); grid-template-areas: 'journey main' 'journey side'; }
    }
    @container (max-width: 700px) {
      .layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'main' 'side' 'journey'; }
      .hero { padding: 1rem; }
      .hero .actions { width: 100%; }
    }

    /* ---------- journey ---------- */
    .journey { list-style: none; margin: 0; padding: 0; }
    /* Icon on the start side (right in Arabic, left in English), text next to it aligned to the start. */
    .journey li { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: .8rem; position: relative; padding-block-end: 1.4rem; }
    .journey li:last-child { padding-block-end: 0; }
    .journey li:not(:last-child)::after { content: ''; position: absolute; inset-inline-start: 19px; top: 44px; bottom: 4px; width: 2px; background: var(--fo-border); }
    .journey li.done:not(:last-child)::after { background: color-mix(in srgb, var(--p-green-500) 45%, var(--fo-border)); }
    .journey .dot { order: -1; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--fo-bg); color: var(--fo-muted); border: 1px solid var(--fo-border); }
    .journey .done .dot { background: color-mix(in srgb, var(--p-green-500) 12%, transparent); color: var(--p-green-600); border-color: transparent; }
    .journey .current .dot { background: color-mix(in srgb, var(--p-blue-500) 12%, transparent); color: var(--p-blue-600); border-color: transparent;
                             box-shadow: 0 0 0 4px color-mix(in srgb, var(--p-blue-500) 12%, transparent); }
    .journey .failed .dot { background: color-mix(in srgb, var(--p-red-500) 12%, transparent); color: var(--p-red-600); border-color: transparent; }
    .journey .body { text-align: start; padding-top: .1rem; min-width: 0; }
    .journey h3 { margin: 0; font-size: .95rem; font-weight: 700; display: flex; justify-content: flex-start; align-items: center; gap: .4rem; }
    .journey .pending h3 { color: var(--fo-muted); font-weight: 600; }
    .journey .current h3::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--p-blue-500); order: 2; }
    .journey time, .journey p { display: block; margin: .25rem 0 0; font-size: .8rem; color: var(--fo-muted); }
    .journey .failed p { color: var(--p-red-600); }
    .journey-foot { margin-top: 1.25rem; }

    /* ---------- full log dialog ---------- */
    .log-filters { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .log-filters button { border: 1px solid var(--fo-border); background: var(--fo-surface); color: var(--fo-text); border-radius: 999px;
                          padding: .35rem .85rem; font: inherit; font-size: .82rem; cursor: pointer; display: inline-flex; gap: .35rem; align-items: center; }
    .log-filters button.on { background: var(--p-primary-600); border-color: var(--p-primary-600); color: #fff; }
    .log-filters .n { font-size: .72rem; opacity: .75; }
    .log { list-style: none; padding: 0; margin: 0; }
    .log li { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: .8rem; position: relative; padding-block-end: 1.1rem; }
    .log li:last-child { padding-block-end: 0; }
    .log li:not(:last-child)::after { content: ''; position: absolute; inset-inline-start: 17px; top: 40px; bottom: 2px; width: 2px; background: var(--fo-border); }
    .log .ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: .9rem;
               color: var(--t); background: color-mix(in srgb, var(--t) 13%, transparent); }
    .log .entry { border: 1px solid var(--fo-border); border-radius: 12px; padding: .65rem .85rem; min-width: 0; }
    .log .row1 { display: flex; justify-content: space-between; align-items: flex-start; gap: .75rem; }
    .log .row1 strong { font-size: .92rem; }
    .log .when { font-size: .75rem; color: var(--fo-muted); white-space: nowrap; }
    .log .by { font-size: .78rem; color: var(--fo-muted); margin-top: .15rem; display: flex; align-items: center; gap: .3rem; }
    .log .chg { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; margin-top: .45rem; }
    .log .chg i { font-size: .7rem; color: var(--fo-muted); }
    .log .chg .status-chip { font-size: .75rem; padding: .15rem .55rem; }
    .log .txt { margin: .45rem 0 0; font-size: .86rem; white-space: pre-wrap; overflow-wrap: anywhere; }
    .log .txt.quote { background: var(--fo-bg); border-radius: 8px; padding: .5rem .65rem; }
    .log .txt small { display: block; color: var(--fo-muted); font-size: .74rem; margin-bottom: .15rem; }
    .log .msg-meta { display: flex; gap: .4rem; align-items: center; margin-top: .45rem; font-size: .75rem; color: var(--fo-muted); }
    .log .msg-meta .st { padding: .1rem .5rem; border-radius: 999px; background: var(--fo-bg); color: var(--fo-text); }
    .log .msg-meta .st.bad { background: color-mix(in srgb, var(--p-red-500) 12%, transparent); color: var(--p-red-600); }
    .log-empty { color: var(--fo-muted); text-align: center; padding: 1.5rem 0; }

    /* ---------- summary tiles ---------- */
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; }
    @media (max-width: 560px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .tile { border: 1px solid var(--fo-border); border-radius: 12px; padding: .85rem .75rem; display: flex; flex-direction: column; gap: .7rem; min-width: 0; }
    .tile-h { display: flex; justify-content: space-between; align-items: center; gap: .4rem; color: var(--fo-muted); font-size: .78rem; }
    .tile-h i { font-size: 1rem; }
    .tile strong { font-size: 1rem; font-weight: 700; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tile .status-chip { align-self: center; }

    /* ---------- services ---------- */
    table.items { width: 100%; border-collapse: collapse; }
    table.items th { font-size: .8rem; font-weight: 600; color: var(--fo-muted); padding: .5rem .75rem; text-align: start; border-bottom: 1px solid var(--fo-border); }
    table.items td { padding: .9rem .75rem; text-align: start; border-bottom: 1px solid var(--fo-border); }
    table.items .num { text-align: center; }
    table.items .end { text-align: end; }
    .total { display: flex; justify-content: space-between; align-items: center; padding: 1rem .75rem 0; font-weight: 700; }
    .total .amount { color: var(--p-primary-600); font-size: 1.1rem; }

    /* ---------- notes ---------- */
    .note-list { display: flex; flex-direction: column; gap: .6rem; }
    .note { background: var(--fo-bg); border-radius: 10px; padding: .7rem .85rem; }
    .note .label { font-size: .75rem; color: var(--fo-muted); display: flex; gap: .35rem; align-items: center; margin-bottom: .25rem; }
    .note p { margin: 0; white-space: pre-wrap; }
    .note.warn { background: color-mix(in srgb, var(--p-red-500) 8%, transparent); }
    .notes-empty { color: var(--fo-muted); font-size: .9rem; }
    .notes-foot { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: .75rem; }
    .note-box { display: flex; flex-direction: column; gap: .5rem; margin-top: .75rem; }
    .note-box .row { display: flex; gap: .5rem; justify-content: flex-end; }

    /* ---------- customer ---------- */
    .who { display: flex; align-items: center; gap: .9rem; padding-block-end: 1rem; border-bottom: 1px solid var(--fo-border); }
    .avatar { width: 52px; height: 52px; border-radius: 50%; flex: none; display: grid; place-items: center; font-weight: 700; font-size: 1.05rem;
              background: color-mix(in srgb, var(--p-primary-500) 12%, transparent); color: var(--p-primary-700); }
    .who-name { flex: 1; min-width: 0; font-weight: 700; font-size: 1.05rem; }
    .who-name a { color: inherit; text-decoration: none; }
    .who-name a:hover { color: var(--p-primary-600); }
    .contact-row { display: flex; align-items: center; gap: .75rem; padding-block: .9rem; border-bottom: 1px solid var(--fo-border); }
    .contact-row:last-child { border: 0; padding-block-end: 0; }
    .contact-row > i { color: var(--p-primary-600); }
    .contact-row .grow { flex: 1; min-width: 0; }
    .icon-btn { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; text-decoration: none; flex: none;
                background: color-mix(in srgb, var(--p-primary-500) 10%, transparent); color: var(--p-primary-600); }
    .icon-btn.wa { background: color-mix(in srgb, #25d366 14%, transparent); color: #128c7e; }
    .icon-btn:hover { filter: brightness(.95); }
    .map-btn { display: inline-flex; align-items: center; gap: .4rem; flex: none; border: 1px solid var(--fo-border); border-radius: 8px;
               padding: .4rem .7rem; font-size: .82rem; color: var(--fo-text); text-decoration: none; }
    .map-btn:hover { border-color: var(--p-primary-400); color: var(--p-primary-600); }

    /* ---------- billing ---------- */
    .inv { display: flex; align-items: center; gap: .6rem; padding: .5rem 0; }
    .inv a { font-weight: 600; }
    .inv .grow { flex: 1; }
    .wide-btn { margin-top: .75rem; }
    .msg-actions { display: flex; gap: .5rem; align-items: center; margin-top: .75rem; }
    .msg-actions p-button { flex: 1; }
    .msg-actions p-button ::ng-deep .p-button { width: 100%; justify-content: center; }
    .msg-actions .icon-btn { width: 40px; height: 40px; }
    .msg-preview { background: color-mix(in srgb, #25d366 10%, var(--fo-bg)); border-radius: 12px; padding: .7rem .85rem;
                   font-size: .88rem; white-space: pre-wrap; margin-bottom: .5rem; }
    .wide-btn ::ng-deep .p-button { width: 100%; justify-content: center; }

    /* ---------- loading ---------- */
    .skeleton { background: linear-gradient(90deg, var(--fo-border) 25%, var(--fo-bg) 50%, var(--fo-border) 75%); background-size: 200% 100%;
                animation: shimmer 1.2s infinite; border-radius: var(--fo-radius); }
    @keyframes shimmer { to { background-position: -200% 0; } }
  `,
  template: `
    <nav class="crumbs">
      <a routerLink="/bookings">{{ 'bookings.title' | translate }}</a>
      <i class="pi pi-angle-left rtl-flip"></i>
      <span>{{ 'bookingDetail.title' | translate }}</span>
    </nav>

    @if (booking(); as b) {
      <!-- ============ header ============ -->
      <section class="card hero">
        <div class="hero-title">
          <h1>
            {{ 'bookings.number' | translate: { n: b.number } }}
            <span class="status-chip" [style.--c]="color(b.status)">{{ 'bookingStatus.' + b.status | translate }}</span>
          </h1>
          <p>{{ b.scheduledStart | ldate: 'fullDate' }} · {{ b.scheduledStart | ldate: 'time' }}</p>
        </div>

        <div class="meta">
          <div class="meta-item">
            <i class="pi pi-clock"></i>
            <div>
              <small>{{ 'bookingDetail.scheduledTime' | translate }}</small>
              <strong>{{ b.scheduledStart | ltimeRange: b.scheduledEnd }}</strong>
            </div>
          </div>
          <div class="meta-item">
            <i class="pi pi-user"></i>
            <div>
              <small>{{ 'bookingDetail.assignedTech' | translate }}</small>
              <strong>{{ techNames() || ('bookings.noTechnician' | translate) }}</strong>
            </div>
          </div>
        </div>

        <div class="actions">
          @if (primaryAction(); as t) {
            <p-button [icon]="style(t).icon" [severity]="style(t).severity" [label]="'bookingAction.' + t | translate" [loading]="busy()" (onClick)="move(t)" />
          }
          @if (isOffice && canAssign() && !b.technicians.length) {
            <p-button icon="pi pi-user-plus" [label]="'bookings.assign' | translate" [outlined]="true" (onClick)="openAssign()" />
          }
          @if (isOffice && editable()) {
            <a [routerLink]="['/bookings', b.id, 'edit']"><p-button icon="pi pi-pencil" [label]="'common.edit' | translate" severity="secondary" [outlined]="true" /></a>
          }
          @if (moreItems().length) {
            <p-button icon="pi pi-ellipsis-h" [label]="'bookingDetail.more' | translate" severity="secondary" [outlined]="true" (onClick)="moreMenu.toggle($event)" />
            <p-menu #moreMenu [model]="moreItems()" [popup]="true" appendTo="body" />
          }
        </div>
      </section>

      <div class="layout">
        <!-- ============ journey ============ -->
        <div class="col col-journey">
          <section class="card">
            <div class="card-h"><i class="pi pi-history"></i><h2>{{ 'bookings.timeline' | translate }}</h2></div>
            <ol class="journey">
              @for (s of journey(); track s.status) {
                <li [class]="s.state">
                  <div class="body">
                    <h3>{{ 'bookingDetail.step.' + s.status | translate }}</h3>
                    @if (s.at) { <time>{{ s.at | ldate: 'medium' }}</time> }
                    @if (s.state === 'pending') {
                      <p>{{ 'bookingDetail.waiting' | translate }}</p>
                    } @else if (s.detail) {
                      <p>{{ s.detail }}</p>
                    }
                  </div>
                  <span class="dot"><i [class]="s.state === 'done' && s.status !== 'COMPLETED' ? 'pi pi-check' : s.icon"></i></span>
                </li>
              }
            </ol>
            <div class="journey-foot wide-btn">
              <p-button [label]="'bookingDetail.viewAll' | translate" [outlined]="true" (onClick)="openLog()" />
            </div>
          </section>
        </div>

        <!-- ============ main ============ -->
        <div class="col col-main">
          <section class="card">
            <div class="card-h"><i class="pi pi-clipboard"></i><h2>{{ 'bookingDetail.summary' | translate }}</h2></div>
            <div class="tiles">
              <div class="tile">
                <div class="tile-h"><span>{{ 'bookingDetail.number' | translate }}</span><i class="pi pi-hashtag"></i></div>
                <strong class="ltr">#{{ b.number }}</strong>
              </div>
              <div class="tile">
                <div class="tile-h"><span>{{ 'bookingDetail.date' | translate }}</span><i class="pi pi-calendar"></i></div>
                <strong>{{ b.scheduledStart | ldate: 'dayMonthYear' }}</strong>
              </div>
              <div class="tile">
                <div class="tile-h"><span>{{ 'bookingDetail.status' | translate }}</span><i class="pi pi-info-circle"></i></div>
                <span class="status-chip" [style.--c]="color(b.status)">{{ 'bookingStatus.' + b.status | translate }}</span>
              </div>
              <div class="tile">
                <div class="tile-h"><span>{{ 'bookings.paymentMethod' | translate }}</span><i class="pi pi-wallet"></i></div>
                <strong>{{ b.paymentMethod ? ('paymentMethod.' + b.paymentMethod | translate) : ('bookings.paymentNotSet' | translate) }}</strong>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-h"><i class="pi pi-user"></i><h2>{{ 'bookingDetail.customerInfo' | translate }}</h2></div>
            <div class="who">
              <span class="avatar">{{ initials(b.customerName) }}</span>
              <div class="who-name">
                @if (isOffice) { <a [routerLink]="['/customers', b.customerId]">{{ b.customerName }}</a> } @else { {{ b.customerName }} }
              </div>
            </div>
            <div class="contact-row">
              <i class="pi pi-phone"></i>
              <span class="grow"><span class="ltr">{{ b.customerPhone | phone }}</span></span>
              <a class="icon-btn" [href]="'tel:' + b.customerPhone" [attr.aria-label]="'bookingDetail.call' | translate"><i class="pi pi-phone"></i></a>
              <a class="icon-btn wa" [href]="waLink(b.customerPhone)" target="_blank" rel="noopener" [attr.aria-label]="'channels.WHATSAPP' | translate"><i class="pi pi-whatsapp"></i></a>
            </div>
            <div class="contact-row">
              <i class="pi pi-map-marker"></i>
              <span class="grow">{{ b.addressText || ('bookings.noAddress' | translate) }}</span>
              @if (b.navigationUrl) {
                <a class="map-btn" [href]="b.navigationUrl" target="_blank" rel="noopener"><i class="pi pi-map"></i>{{ 'bookingDetail.showOnMap' | translate }}</a>
              }
            </div>
          </section>

          <section class="card">
            <div class="card-h"><i class="pi pi-briefcase"></i><h2>{{ 'bookings.services' | translate }}</h2></div>
            <table class="items">
              <thead>
                <tr><th>{{ 'bookings.service' | translate }}</th><th class="num">{{ 'bookings.qty' | translate }}</th><th class="end">{{ 'bookingDetail.price' | translate }}</th></tr>
              </thead>
              <tbody>
                @for (it of b.items; track $index) {
                  <tr>
                    <td>{{ it.description }}</td>
                    <td class="num">{{ it.quantity }}</td>
                    <td class="end"><span class="ltr">{{ it.totalHalalas | sar }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="total">
              <span>{{ 'bookings.subtotal' | translate }}</span>
              <span class="amount ltr">{{ b.subtotalHalalas | sar }}</span>
            </div>
          </section>

          <section class="card">
            <div class="card-h"><i class="pi pi-images"></i><h2>{{ 'bookingDetail.photos' | translate }}</h2></div>
            @if (tenants.locked('photos')) {
              <app-locked-feature feature="photos" />
            } @else {
              <app-photo-gallery
                variant="cards"
                [bookingId]="b.id"
                [canUpload]="['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'].includes(b.status)"
                [completed]="b.status === 'COMPLETED'"
              />
            }
          </section>

          <section class="card">
            <div class="card-h"><i class="pi pi-file-edit"></i><h2>{{ 'bookingDetail.notes' | translate }}</h2></div>
            <div class="note-list">
              @if (b.cancelReason) {
                <div class="note warn"><div class="label"><i class="pi pi-times-circle"></i>{{ 'bookings.cancelReason' | translate }}</div><p>{{ b.cancelReason }}</p></div>
              }
              @if (b.notes) {
                <div class="note"><div class="label"><i class="pi pi-users"></i>{{ 'bookings.notes' | translate }}</div><p>{{ b.notes }}</p></div>
              }
              @if (b.internalNotes && isOffice) {
                <div class="note"><div class="label"><i class="pi pi-lock"></i>{{ 'bookings.internalNotes' | translate }}</div><p>{{ b.internalNotes }}</p></div>
              }
              @for (n of noteEvents(); track n.id) {
                <div class="note">
                  <div class="label"><i class="pi pi-comment"></i>{{ n.actorName || ('events.NOTE' | translate) }} · {{ n.at | ldate: 'medium' }}</div>
                  <p>{{ n.note }}</p>
                </div>
              }
            </div>
            @if (noteOpen()) {
              <div class="note-box">
                <textarea pTextarea [(ngModel)]="note" rows="3" [placeholder]="'bookings.addNote' | translate" autofocus></textarea>
                <div class="row">
                  <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" size="small" (onClick)="noteOpen.set(false)" />
                  <p-button icon="pi pi-send" [label]="'common.save' | translate" size="small" [disabled]="!note.trim()" (onClick)="addNote()" />
                </div>
              </div>
            } @else {
              <div class="notes-foot">
                @if (!hasNotes()) { <span class="notes-empty">{{ 'bookingDetail.noNotes' | translate }}</span> } @else { <span></span> }
                <p-button icon="pi pi-plus-circle" [label]="'bookingDetail.addNote' | translate" [outlined]="true" size="small" (onClick)="noteOpen.set(true)" />
              </div>
            }
          </section>
        </div>

        <!-- ============ messages & billing ============ -->
        <div class="col col-side">

          @if (isOffice) {
            <section class="card">
              <div class="card-h">
                <i class="pi pi-comments"></i><h2>{{ 'messages.title' | translate }}</h2>
                <a class="link" routerLink="/messages">{{ 'bookingDetail.viewAllShort' | translate }}</a>
              </div>
              <app-messages #bookingMessages [bookingId]="b.id" [compact]="true" />
              <div class="msg-actions">
                <p-button icon="pi pi-send" [label]="'bookingDetail.newMessage' | translate" [outlined]="true" (onClick)="openMessage()" />
                <a class="icon-btn wa" [href]="waLink(b.customerPhone)" target="_blank" rel="noopener"
                   [attr.aria-label]="'bookingDetail.openWhatsapp' | translate" [title]="'bookingDetail.openWhatsapp' | translate"><i class="pi pi-whatsapp"></i></a>
              </div>
            </section>

            <section class="card">
              <div class="card-h"><i class="pi pi-receipt"></i><h2>{{ 'invoices.billing' | translate }}</h2></div>
              @if (tenants.locked('quotes_invoices')) {
                <app-locked-feature feature="quotes_invoices" />
              } @else {
              @for (inv of invoices(); track inv.id) {
                <div class="inv">
                  <a [routerLink]="['/invoices', inv.id]" class="ltr">INV-{{ inv.number }}</a>
                  <span class="grow ltr">{{ inv.totalHalalas | sar }}</span>
                  <app-invoice-status [status]="inv.status" />
                </div>
              } @empty {
                @if (b.invoiceState === 'PENDING') {
                  <p class="muted"><i class="pi pi-spin pi-spinner"></i> {{ 'invoices.autoPending' | translate }}</p>
                } @else if (b.invoiceState === 'FAILED') {
                  <p style="color: var(--p-red-600)"><i class="pi pi-exclamation-triangle"></i> {{ 'invoices.autoFailed' | translate }}</p>
                } @else {
                  <p class="muted">{{ 'invoices.noneForBooking' | translate }}</p>
                }
              }
              <div class="actions" style="margin-top: .75rem">
                @if (canInvoice()) {
                  <p-button icon="pi pi-file-check" [label]="'invoices.issueForBooking' | translate" size="small" [loading]="billingBusy()" (onClick)="issueInvoice()" />
                }
                @if (b.status !== 'CANCELLED' && b.status !== 'NO_SHOW') {
                  <p-button icon="pi pi-file-edit" [label]="'quotes.fromBooking' | translate" size="small" [outlined]="true" [loading]="billingBusy()" (onClick)="createQuote()" />
                }
              </div>
              }
            </section>
          }
        </div>
      </div>

      <!-- full log: every visit event plus the messages sent to the customer, oldest first -->
      <p-dialog [header]="'bookingDetail.log.title' | translate: { n: b.number }" [(visible)]="logOpen" [modal]="true" [dismissableMask]="true" [style]="{ width: '640px', maxWidth: '95vw' }" [contentStyle]="{ maxHeight: '70vh' }" [draggable]="false">
        <div class="log-filters">
          @for (f of logFilters; track f) {
            @if (f !== 'messages' || isOffice) {
              <button type="button" [class.on]="logFilter() === f" (click)="logFilter.set(f)">
                {{ 'bookingDetail.log.filters.' + f | translate }} <span class="n">{{ logCounts()[f] }}</span>
              </button>
            }
          }
        </div>
        <ol class="log">
          @for (e of filteredLog(); track e.id) {
            <li>
              <span class="ic" [style.--t]="e.tone"><i [class]="e.icon"></i></span>
              <div class="entry">
                <div class="row1">
                  <strong>{{ e.title }}</strong>
                  <span class="when">{{ e.at | ldate: 'dayMonthYear' }} · {{ e.at | ldate: 'time' }}</span>
                </div>
                <div class="by"><i class="pi pi-user" style="font-size: .7rem"></i>{{ e.actor }}</div>
                @if (e.to) {
                  <div class="chg">
                    @if (e.from) {
                      <span class="status-chip" [style.--c]="color(e.from)">{{ 'bookingStatus.' + e.from | translate }}</span>
                      <i class="pi pi-arrow-left rtl-flip"></i>
                    }
                    <span class="status-chip" [style.--c]="color(e.to)">{{ 'bookingStatus.' + e.to | translate }}</span>
                  </div>
                }
                @if (e.text) {
                  <p class="txt" [class.quote]="e.quote" dir="auto">
                    @if (e.textLabel) { <small>{{ e.textLabel }}</small> }{{ e.text }}
                  </p>
                }
                @if (e.channel || e.msgStatus) {
                  <div class="msg-meta">
                    @if (e.channel) { <span>{{ 'channels.' + e.channel | translate }}</span> }
                    @if (e.msgStatus) { <span class="st" [class.bad]="e.msgStatus === 'FAILED'">{{ 'notificationStatus.' + e.msgStatus | translate }}</span> }
                  </div>
                }
              </div>
            </li>
          } @empty {
            <div class="log-empty">{{ 'bookingDetail.log.empty' | translate }}</div>
          }
        </ol>
      </p-dialog>
    } @else {
      <div class="skeleton" style="height: 110px; margin-bottom: 1.25rem"></div>
      <div class="layout">
        <div class="col col-journey"><div class="skeleton" style="height: 420px"></div></div>
        <div class="col col-main"><div class="skeleton" style="height: 160px"></div><div class="skeleton" style="height: 200px"></div></div>
        <div class="col col-side"><div class="skeleton" style="height: 220px"></div></div>
      </div>
    }

    <p-dialog [header]="'bookingDetail.newMessage' | translate" [(visible)]="messageOpen" [modal]="true" [style]="{ width: '520px', maxWidth: '95vw' }" [draggable]="false">
      @if (booking(); as b) {
        <p class="muted" style="margin-top: 0">{{ 'bookingDetail.messageTo' | translate: { name: b.customerName } }} · <span class="ltr">{{ b.customerPhone | phone }}</span></p>
      }
      <div class="field">
        <label for="m-text">{{ 'messages.message' | translate }}</label>
        <textarea pTextarea id="m-text" [(ngModel)]="messageText" rows="4" [maxlength]="messageMax" dir="auto"></textarea>
        <small class="hint" style="display:flex; justify-content:space-between; gap:1rem">
          <span>{{ 'bookingDetail.messageHint' | translate }}</span>
          <span class="ltr">{{ messageText.length }}/{{ messageMax }}</span>
        </small>
      </div>
      @if (messageText.trim()) {
        <div class="msg-preview" dir="rtl">{{ messagePreview() }}</div>
      }
      <div class="dialog-actions">
        <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="messageOpen.set(false)" />
        <p-button icon="pi pi-send" [label]="'bookingDetail.send' | translate" [disabled]="!messageText.trim()" [loading]="messageSending()" (onClick)="sendMessage()" />
      </div>
    </p-dialog>

    <p-dialog [header]="'bookings.assign' | translate" [(visible)]="assignOpen" [modal]="true" [style]="{ width: '480px', maxWidth: '95vw' }" [draggable]="false">
      <div class="field">
        <label for="a-techs">{{ 'bookings.technicians' | translate }}</label>
        <p-multiselect inputId="a-techs" [options]="technicianOptions()" [(ngModel)]="selectedTechs" optionLabel="label" optionValue="value" display="chip" [fluid]="true" appendTo="body" />
      </div>
      <div class="dialog-actions">
        <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="assignOpen.set(false)" />
        <p-button [label]="'bookings.assign' | translate" [disabled]="!selectedTechs.length" [loading]="busy()" (onClick)="assign(false)" />
      </div>
    </p-dialog>

    <p-dialog [header]="'bookingAction.CANCELLED' | translate" [(visible)]="cancelOpen" [modal]="true" [style]="{ width: '480px', maxWidth: '95vw' }" [draggable]="false">
      <div class="field">
        <label for="c-reason">{{ 'bookings.cancelReason' | translate }}</label>
        <textarea pTextarea id="c-reason" [(ngModel)]="cancelReason" rows="3"></textarea>
      </div>
      <div class="dialog-actions">
        <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="cancelOpen.set(false)" />
        <p-button [label]="'bookingAction.CANCELLED' | translate" severity="danger" [loading]="busy()" (onClick)="doMove('CANCELLED', cancelReason)" />
      </div>
    </p-dialog>
  `,
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
  protected readonly canInvoice = computed(
    () =>
      !['CANCELLED', 'NO_SHOW'].includes(this.booking()?.status ?? '') &&
      !this.invoices().some((i) => i.status !== 'VOID'),
  );
  protected readonly transitions = computed(() => this.booking()?.allowedTransitions ?? []);
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
    const createdByCustomer = b.events.some((e) => e.type === 'CREATED' && e.note === 'booking_page');
    const actorOf = (e: VisitEvent) =>
      e.actorName
        ? t('bookingDetail.log.by', { name: e.actorName })
        : t(e.type === 'CREATED' && createdByCustomer ? 'bookingDetail.log.byCustomer' : 'bookingDetail.log.bySystem');

    const entries: LogEntry[] = b.events.map((e): LogEntry => {
      const base = { id: e.id, at: e.at, actor: actorOf(e) };
      switch (e.type) {
        case 'CREATED':
          return { ...base, group: 'activity', icon: 'pi pi-plus-circle', tone: TONE.teal, to: e.toStatus,
                   title: t(e.note === 'booking_page' ? 'events.CREATED_PUBLIC' : 'events.CREATED') };
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
        detail = this.translate.instant(created?.note === 'booking_page' ? 'events.CREATED_PUBLIC' : 'bookingDetail.stepDone.NEW');
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
    return this.technicians()
      .filter((t) => t.active)
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
