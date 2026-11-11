import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, debounceTime, of, switchMap, catchError } from 'rxjs';

import { Address, Booked, Item, PaymentMethod, Quote, Service, Slot } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { LocalDatePipe, SarPipe, formatDate } from '../../core/format';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { defaultServiceImage, serviceIcon } from '../../core/service-image';
import { ServiceTextPipe, quoteLine } from '../../core/service-names';
import { ToastService } from '../../core/toast';

type Step = 1 | 2 | 3 | 4;

interface Pick {
  service: Service;
  quantity: number;
  addonIds: string[];
}

const PAYMENTS: PaymentMethod[] = ['CASH', 'MADA', 'BANK_TRANSFER', 'APPLE_PAY', 'CARD'];

/** Four real steps: what, when, where, confirm. Prices and open times come from the company's own rules. */
@Component({
  selector: 'pt-book',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, TranslatePipe, LocalDatePipe, SarPipe, ServiceTextPipe],
  styles: `
    /* Booking, after the "Your service" design: mint background, a labelled stepper, a big title,
       white rounded panels and a floating summary bar at the bottom. */
    :host { display: block; position: relative; min-height: 100%; overflow-x: clip;
            background:
              radial-gradient(600px 400px at 100% 0%, rgba(20, 155, 116, .10), transparent 70%),
              radial-gradient(520px 420px at 0% 70%, rgba(20, 155, 116, .10), transparent 70%),
              linear-gradient(180deg, #f3faf8 0%, #f8fbfa 100%); }
    .bk { max-width: 1600px; margin: 0 auto; padding: 22px 20px 150px; }

    /* Top: close + stepper with labels */
    .top { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 26px; }
    .close { flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: #fff;
             color: #0f172a; text-decoration: none; box-shadow: 0 6px 18px -10px rgba(15, 42, 61, .35); }
    .close:hover { color: #0d5c46; }
    .stepper { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); max-width: 760px; margin: 0 auto; list-style: none; padding: 0; }
    .stepper li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
                  font-size: .92rem; font-weight: 600; color: #64748b; }
    /* The line to the next step, from this circle's centre. */
    .stepper li:not(:last-child)::after { content: ''; position: absolute; top: 18px; inset-inline-start: calc(50% + 22px);
                                          width: calc(100% - 44px); height: 3px; border-radius: 3px; background: #dbe7e3; }
    .stepper li.past:not(:last-child)::after { background: #149b74; }
    .stepper .dot { position: relative; z-index: 1; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
                    background: #fff; color: #334155; font-weight: 800; border: 2px solid #dbe7e3; }
    .stepper li.past .dot, .stepper li.now .dot { background: #0d5c46; border-color: #0d5c46; color: #fff; }
    .stepper li.now .dot { box-shadow: 0 0 0 6px rgba(20, 155, 116, .15); }
    .stepper li.now, .stepper li.past { color: #0f172a; }

    /* Title block */
    .kicker { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 999px; background: #fff;
              color: #0d5c46; font-weight: 700; font-size: .88rem; box-shadow: 0 6px 18px -12px rgba(13, 92, 70, .5); border: 1px solid #ddf1ea; }
    .kicker i { color: #f5b301; }
    h1 { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 900; color: #0f172a; margin: 14px 0 6px; line-height: 1.15; }
    .lead { color: #475569; margin: 0 0 22px; font-size: 1.02rem; }
    .section-title { font-size: 1.05rem; font-weight: 800; margin: 22px 0 10px; color: #0f172a; }

    .panel { background: #fff; border-radius: 26px; padding: 24px; border: 1px solid rgba(226, 232, 240, .8);
             box-shadow: 0 24px 50px -30px rgba(13, 92, 70, .35); }

    /* One service chosen on a service card: photo on one side, details and options on the other. */
    .focus { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 0; padding: 0; overflow: hidden; }
    .focus-media { position: relative; min-height: 300px; }
    .focus-media img { position: absolute; inset: 8px; width: calc(100% - 8px); height: calc(100% - 16px); object-fit: cover;
                       border-start-start-radius: 20px; border-end-start-radius: 20px; border-start-end-radius: 50% 50%; border-end-end-radius: 50% 50%;
                       background: #eef6f4; }
    /* The green crescent along the photo's inner edge. */
    .focus-media::after { content: ''; position: absolute; top: 0; bottom: 0; inset-inline-end: -14px; width: 70px;
                          border-inline-end: 10px solid #149b74; border-start-end-radius: 50% 50%; border-end-end-radius: 50% 50%;
                          opacity: .85; pointer-events: none; }
    .focus-info { padding: 28px 28px 24px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .focus-head { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid #e8eef0; }
    .focus-ico { flex: none; width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center;
                 background: #e9f7f2; color: #0d5c46; font-size: 1.9rem; }
    .focus-text { flex: 1; min-width: 0; }
    .focus-text h2 { margin: 4px 0 6px; font-size: 1.5rem; font-weight: 900; color: #0f172a; }
    .focus-text p { margin: 0; color: #475569; line-height: 1.7; white-space: pre-line; }
    .price-chip { flex: none; align-self: flex-start; padding: 10px 16px; border-radius: 16px; background: #e9f7f2; color: #0d5c46;
                  font-weight: 900; font-size: 1.25rem; white-space: nowrap; }
    .price-chip small { font-size: .8rem; font-weight: 700; }
    .focus-foot { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
                  padding: 16px 28px 22px; border-top: 1px solid #e8eef0; }
    .feats { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 0; list-style: none; margin: 0; padding: 0; }
    .feats li { display: flex; align-items: center; gap: 8px; padding-inline: 18px; color: #1e293b; font-weight: 600; font-size: .95rem; }
    .feats li + li { border-inline-start: 1px solid #dbe7e3; }
    .feats li:first-child { padding-inline-start: 0; }
    .feats i { color: #149b74; font-size: 1.15rem; }

    /* Quantity and add-ons */
    .extra { display: grid; gap: 12px; }
    .svc .extra { margin-top: 14px; padding-top: 14px; border-top: 1px dashed #dbe7e3; }
    .qty-label { font-weight: 700; color: #0f172a; }
    .qty { display: flex; align-items: center; gap: 18px; }
    .qty button { width: 52px; height: 52px; border-radius: 50%; border: 0; background: #e9f7f2; color: #0d5c46; font-size: 1.5rem;
                  font-weight: 700; cursor: pointer; transition: background .2s; }
    .qty button:hover { background: #d3f0e6; }
    .qty b { min-width: 60px; text-align: center; font-size: 1.6rem; font-weight: 900; color: #0f172a; }
    .svc .qty button { width: 42px; height: 42px; font-size: 1.2rem; }
    .svc .qty b { font-size: 1.2rem; min-width: 44px; }
    .addons { display: flex; flex-wrap: wrap; gap: 8px; }
    .addon { display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 999px; border: 1.5px solid #dbe7e3;
             background: #fff; font-size: .92rem; cursor: pointer; transition: border-color .2s, background .2s; }
    .addon.on { border-color: #149b74; background: #f0fdf8; color: #0d5c46; font-weight: 700; }
    .addon input { width: 18px; height: 18px; accent-color: #149b74; margin: 0; }
    .addon .ltr { color: #64748b; font-weight: 600; }

    .btn-main { display: inline-flex; align-items: center; justify-content: center; gap: 10px; border: 0; border-radius: 16px;
                padding: 15px 26px; background: linear-gradient(90deg, #0d5c46, #149b74); color: #fff; font: inherit; font-weight: 800;
                font-size: 1.02rem; cursor: pointer; box-shadow: 0 12px 24px -12px rgba(13, 92, 70, .7); transition: transform .2s; text-decoration: none; }
    .btn-main:hover:not(:disabled) { transform: translateY(-1px); }
    .btn-main:disabled { opacity: .5; cursor: default; box-shadow: none; }
    .btn-soft { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid #cdeee2; border-radius: 16px; padding: 13px 20px;
                background: #fff; color: #0d5c46; font: inherit; font-weight: 800; cursor: pointer; }
    .btn-soft:hover { background: #f0fdf8; }

    /* Several services: picture cards in two columns */
    .svc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .svc { background: #fff; border-radius: 22px; padding: 14px; border: 2px solid transparent; cursor: pointer;
           box-shadow: 0 14px 30px -24px rgba(13, 92, 70, .45); transition: border-color .2s; }
    .svc:hover { border-color: #cdeee2; }
    .svc.on { border-color: #149b74; }
    .svc .line { display: flex; gap: 14px; align-items: center; }
    .svc .thumb { flex: none; width: 76px; height: 76px; border-radius: 16px; object-fit: cover; background: #eef6f4; }
    .svc .name { flex: 1; min-width: 0; font-weight: 800; color: #0f172a; }
    .svc .name small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
                       font-weight: 400; color: #64748b; font-size: .86rem; margin-top: 3px; }
    .svc .side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .svc .price { font-weight: 800; white-space: nowrap; color: #0d5c46; }
    .svc .price small { font-weight: 500; color: #64748b; }
    .svc .tick { width: 26px; height: 26px; border-radius: 8px; border: 2px solid #dbe7e3; display: grid; place-items: center; color: #fff; }
    .svc.on .tick { background: #149b74; border-color: #149b74; }

    /* Step 2 */
    .days { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 8px; margin-bottom: 18px; scrollbar-width: none; }
    .days button { flex: none; width: 72px; padding: 12px 0; border-radius: 18px; border: 1.5px solid #e2ece9; background: #fff; font: inherit;
                   cursor: pointer; color: #0f172a; text-align: center; line-height: 1.25; }
    .days button small { display: block; color: #64748b; font-size: .75rem; }
    .days button b { display: block; font-size: 1.35rem; }
    .days button.on { background: #0d5c46; border-color: #0d5c46; color: #fff; }
    .days button.on small { color: rgba(255,255,255,.8); }
    .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
    .slots button { min-height: 50px; border-radius: 14px; border: 1.5px solid #e2ece9; background: #fff; font: inherit; font-weight: 700;
                    cursor: pointer; color: #0f172a; }
    .slots button:hover { border-color: #b6eeda; }
    .slots button.on { background: #149b74; border-color: #149b74; color: #fff; }

    /* Step 3 */
    .choice { display: flex; gap: 12px; align-items: flex-start; padding: 16px 18px; background: #fff; border-radius: 18px; margin-bottom: 10px;
              cursor: pointer; border: 2px solid #eef3f2; }
    .choice.on { border-color: #149b74; background: #f7fdfb; }
    .choice input { margin-top: 4px; accent-color: #149b74; width: 18px; height: 18px; }
    .choice small { display: block; color: #64748b; }
    .pays { display: flex; flex-wrap: wrap; gap: 8px; }
    .pays button { border: 1.5px solid #e2ece9; background: #fff; border-radius: 999px; padding: 10px 18px; font: inherit; cursor: pointer; color: #0f172a; }
    .pays button.on { border-color: #149b74; background: #f0fdf8; color: #0d5c46; font-weight: 700; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }

    /* Step 4 */
    .sum dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 12px 16px; }
    .sum dt { color: #64748b; }
    .sum dd { margin: 0; text-align: end; font-weight: 700; }
    .promo { display: flex; gap: 8px; }
    .promo .input { flex: 1; text-transform: uppercase; letter-spacing: .04em; }
    .promo .btn { flex: none; }
    .promo-ok { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 16px;
                background: #f0fdf8; border: 1.5px dashed #6ee7b7; color: #0d5c46; }
    .promo-ok i.pi-ticket { font-size: 1.2rem; }
    .promo-ok span { flex: 1; line-height: 1.35; }
    .promo-ok b { letter-spacing: .04em; }
    .promo-ok small { display: block; color: #0a4938; opacity: .8; }
    .promo-ok button { border: 0; background: none; color: inherit; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
    .promo-err { color: var(--rose); font-size: .88rem; margin: 6px 2px 0; }
    .sum dd.off { color: #0d5c46; }
    .sum .total dt, .sum .total dd { font-weight: 800; color: #0f172a; padding-top: 10px; border-top: 1px solid #e8eef0; }

    /* Floating summary bar */
    .footer { position: fixed; inset-inline: 0; bottom: 0; z-index: 30; padding: 0 16px calc(14px + env(safe-area-inset-bottom)); pointer-events: none; }
    .footer .in { pointer-events: auto; max-width: 1560px; margin: 0 auto; display: flex; align-items: center; gap: 18px; background: #fff;
                  border-radius: 24px; padding: 14px 16px 14px 22px; border: 1px solid rgba(226, 232, 240, .9);
                  box-shadow: 0 24px 50px -20px rgba(15, 42, 61, .35); }
    :host-context([dir='rtl']) .footer .in { padding: 14px 22px 14px 16px; }
    .cell { min-width: 0; line-height: 1.3; }
    .cell small { display: block; color: #64748b; font-size: .82rem; }
    .cell b { display: block; font-size: 1.12rem; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cell.svc-cell { flex: 1.4; display: flex; align-items: center; gap: 12px; }
    .cell.svc-cell .ico { flex: none; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: #e9f7f2; color: #0d5c46; font-size: 1.25rem; }
    .cell.svc-cell > span { min-width: 0; }
    .cell.total { flex: 1; }
    .cell.total b { font-size: 1.3rem; }
    .cell s { color: #94a3b8; font-size: .82rem; margin-inline-start: 6px; font-weight: 500; }
    .vbar { width: 1px; align-self: stretch; background: #e2e8f0; margin: 4px 0; }
    .actions { display: flex; gap: 10px; flex: none; }

    .done { text-align: center; padding-top: 10vh; }
    .done .ok { width: 80px; height: 80px; border-radius: 50%; background: #e9f7f2; color: #149b74; display: grid; place-items: center; margin: 0 auto 18px; font-size: 2.2rem; }
    .done p { color: #475569; max-width: 380px; margin: 8px auto 24px; }

    @media (max-width: 899px) {
      .focus { grid-template-columns: 1fr; }
      .focus-media { min-height: 220px; }
      .focus-media img { inset: 8px; width: calc(100% - 16px); border-radius: 20px; }
      .focus-media::after { display: none; }
      .two { grid-template-columns: 1fr; }
      .svc-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 699px) {
      .bk { padding: 14px 14px 130px; }
      .top { gap: 10px; }
      .stepper li { font-size: .72rem; }
      .stepper .dot { width: 32px; height: 32px; }
      .stepper li:not(:last-child)::after { top: 15px; inset-inline-start: calc(50% + 19px); width: calc(100% - 38px); }
      .panel, .focus-info { padding: 18px; }
      .focus-head { flex-wrap: wrap; }
      .focus-ico { width: 56px; height: 56px; font-size: 1.4rem; }
      .focus-foot { padding: 14px 18px 18px; }
      .feats li { padding-inline: 10px; font-size: .85rem; }
      .footer { padding: 0 8px calc(8px + env(safe-area-inset-bottom)); }
      .footer .in { gap: 10px; padding: 10px 12px !important; border-radius: 20px; }
      .hide-sm { display: none !important; }
      .btn-main { padding: 13px 18px; }
    }
  `,
  template: `
    <div class="bk">
      @if (booked(); as b) {
        <div class="done">
          <div class="ok"><i class="pi pi-check"></i></div>
          <h1>{{ 'book.doneTitle' | translate }}</h1>
          <p>{{ 'book.doneLead' | translate: { n: b.number, when: whenText(b.scheduledStart) } }}</p>
          <a class="btn-main" [routerLink]="['/', store.slug(), 'bookings', b.id]">{{ 'book.viewBooking' | translate }}</a>
        </div>
      } @else if (!store.company()?.bookingOpen && store.company()) {
        <div class="sheet empty"><i class="pi pi-calendar-times"></i><p>{{ 'book.closed' | translate }}</p></div>
      } @else {
        <div class="top">
          <a class="close" [routerLink]="['/', store.slug(), 'bookings']" [attr.aria-label]="'book.close' | translate"><i class="pi pi-times"></i></a>
          <ol class="stepper" [attr.aria-label]="'book.steps' | translate">
            @for (st of stepNames; track st; let i = $index) {
              <li [class.past]="i + 1 < step()" [class.now]="i + 1 === step()" [attr.aria-current]="i + 1 === step() ? 'step' : null">
                <span class="dot">@if (i + 1 < step()) { <i class="pi pi-check" aria-hidden="true"></i> } @else { {{ i + 1 }} }</span>
                {{ st | translate }}
              </li>
            }
          </ol>
        </div>

        <span class="kicker"><i class="pi pi-sparkles" aria-hidden="true"></i>{{ 'book.k' + step() | translate }}</span>
        @switch (step()) {
          @case (1) {
            @if (focused(); as f) {
              <!-- Came from a service card: only that service, its photo, description and options. -->
              <h1>{{ 'book.s1Focus' | translate }}</h1>
              <p class="lead">{{ 'book.s1FocusLead' | translate }}</p>
              <article class="panel focus">
                <div class="focus-media">
                  <img [src]="f.imageUrl || defaultImage(f)" [alt]="f | svc" (error)="imageFailed($event, f)" />
                </div>
                <div class="focus-info">
                  <div class="focus-head">
                    <span class="focus-ico"><i class="pi" [class]="icon(f)" aria-hidden="true"></i></span>
                    <div class="focus-text">
                      <h2>{{ f | svc }}</h2>
                      @if (f | svc: 'description'; as d) { <p>{{ d }}</p> }
                    </div>
                    <span class="price-chip"><span class="ltr">{{ f.basePriceHalalas | sar }}</span>@if (f.pricingType !== 'FIXED') { <small> / {{ 'book.unit.' + f.pricingType | translate }}</small> }</span>
                  </div>
                  @if (pickOf(f); as p) {
                    <ng-container *ngTemplateOutlet="extras; context: { $implicit: f, p: p }" />
                  }
                </div>
                <div class="focus-foot">
                  <!-- What every booking through the portal gets (true for every company). -->
                  <ul class="feats">
                    <li><i class="pi pi-bolt" aria-hidden="true"></i>{{ 'company.ts1' | translate }}</li>
                    <li><i class="pi pi-tag" aria-hidden="true"></i>{{ 'company.ts2' | translate }}</li>
                    <li><i class="pi pi-receipt" aria-hidden="true"></i>{{ 'company.ts3' | translate }}</li>
                  </ul>
                  @if (services().length > 1) {
                    <button type="button" class="btn-soft" (click)="focused.set(null)">
                      <i class="pi pi-plus" aria-hidden="true"></i>{{ 'book.addAnother' | translate }}
                    </button>
                  }
                </div>
              </article>
            } @else {
              <h1>{{ 'book.s1' | translate }}</h1>
              <p class="lead">{{ 'book.s1Lead' | translate }}</p>
              <div class="svc-grid">
                @for (s of services(); track s.id) {
                  <div class="svc" [class.on]="picked(s)" (click)="toggle(s)" role="checkbox" [attr.aria-checked]="picked(s)" tabindex="0"
                       (keydown.enter)="toggle(s)" (keydown.space)="$event.preventDefault(); toggle(s)">
                    <div class="line">
                      <img class="thumb" [src]="s.imageUrl || defaultImage(s)" alt="" loading="lazy" (error)="imageFailed($event, s)" />
                      <span class="name">{{ s | svc }}@if (s | svc: 'description'; as d) { <small>{{ d }}</small> }</span>
                      <span class="side">
                        <span class="tick">@if (picked(s)) { <i class="pi pi-check" style="font-size:.7rem"></i> }</span>
                        <span class="price"><span class="ltr">{{ s.basePriceHalalas | sar }}</span>@if (s.pricingType !== 'FIXED') { <small> / {{ 'book.unit.' + s.pricingType | translate }}</small> }</span>
                      </span>
                    </div>
                    @if (pickOf(s); as p) {
                      <ng-container *ngTemplateOutlet="extras; context: { $implicit: s, p: p }" />
                    }
                  </div>
                } @empty {
                  <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
                }
              </div>
            }

            <!-- Quantity and add-ons of a picked service (in the list and in the single-service card). -->
            <ng-template #extras let-s let-p="p">
              <div class="extra" (click)="$event.stopPropagation()">
                @if (s.pricingType !== 'FIXED') {
                  <span class="qty-label">{{ 'book.qty.' + s.pricingType | translate }}</span>
                  <div class="qty">
                    <button type="button" (click)="setQty(p, p.quantity - step1(s))" [attr.aria-label]="'book.less' | translate">−</button>
                    <b class="tnum">{{ p.quantity }}</b>
                    <button type="button" (click)="setQty(p, p.quantity + step1(s))" [attr.aria-label]="'book.more' | translate">+</button>
                  </div>
                }
                @if (s.addons.length) {
                  <div class="addons">
                    @for (a of s.addons; track a.id) {
                      <label class="addon" [class.on]="p.addonIds.includes(a.id)">
                        <input type="checkbox" [checked]="p.addonIds.includes(a.id)" (change)="toggleAddon(p, a.id)" />
                        <span>{{ a | svc }}</span><span class="ltr">+{{ a.priceHalalas | sar }}</span>
                      </label>
                    }
                  </div>
                }
              </div>
            </ng-template>
          }
          @case (2) {
            <h1>{{ 'book.s2' | translate }}</h1>
            <p class="lead">{{ 'book.s2Lead' | translate: { h: store.company()?.leadTimeHours ?? 2 } }}</p>
            <section class="panel">
            <div class="days">
              @for (d of days(); track d.iso) {
                <button type="button" [class.on]="date() === d.iso" (click)="pickDate(d.iso)">
                  <small>{{ d.weekday }}</small><b class="tnum">{{ d.day }}</b><small>{{ d.month }}</small>
                </button>
              }
            </div>
            @if (loadingSlots()) {
              <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
            } @else if (date() && !slots().length) {
              <div class="sheet empty"><i class="pi pi-clock"></i><p>{{ 'book.noSlots' | translate }}</p></div>
            } @else {
              <div class="slots">
                @for (s of slots(); track s.start) {
                  <button type="button" class="tnum" [class.on]="slot()?.start === s.start" (click)="slot.set(s)">{{ s.start | ldate: 'time' }}</button>
                }
              </div>
            }
            </section>
          }
          @case (3) {
            <h1>{{ 'book.s3' | translate }}</h1>
            <p class="lead">{{ 'book.s3Lead' | translate }}</p>
            <div class="two">
            <section class="panel">
            @for (a of addresses(); track a.id) {
              <label class="choice" [class.on]="addressId() === a.id">
                <input type="radio" name="addr" [checked]="addressId() === a.id" (change)="addressId.set(a.id)" />
                <span>{{ a.label || a.district || a.city }}<small>{{ addressLine(a) }}</small></span>
              </label>
            }
            <label class="choice" [class.on]="addressId() === null">
              <input type="radio" name="addr" [checked]="addressId() === null" (change)="addressId.set(null)" />
              <span>{{ 'book.newAddress' | translate }}</span>
            </label>
            @if (addressId() === null) {
              <div class="sheet" style="margin-bottom: 8px">
                <div class="field"><label for="ct">{{ 'book.city' | translate }}</label><input id="ct" class="input" [(ngModel)]="city" maxlength="80" /></div>
                <div class="field"><label for="ds">{{ 'book.district' | translate }}</label><input id="ds" class="input" [(ngModel)]="district" maxlength="80" /></div>
                <div class="field"><label for="dt">{{ 'book.details' | translate }}</label><input id="dt" class="input" [(ngModel)]="details" maxlength="300" [placeholder]="'book.detailsHint' | translate" /></div>
                <div class="field" style="margin:0"><label for="mp">{{ 'book.mapLink' | translate }}</label><input id="mp" class="input ltr" style="display:block" [(ngModel)]="mapUrl" maxlength="500" placeholder="https://maps.app.goo.gl/…" /><small>{{ 'book.mapHint' | translate }}</small></div>
              </div>
            }
            </section>
            <section class="panel">
            <h2 class="section-title" style="margin-top:0">{{ 'book.payment' | translate }}</h2>
            <div class="pays">
              @for (m of payments; track m) {
                <button type="button" [class.on]="payment() === m" (click)="payment.set(payment() === m ? null : m)">{{ 'payment.' + m | translate }}</button>
              }
            </div>
            <h2 class="section-title">{{ 'book.notes' | translate }}</h2>
            <textarea class="input" rows="3" maxlength="1000" [(ngModel)]="notes" [placeholder]="'book.notesHint' | translate"></textarea>
            </section>
            </div>
          }
          @case (4) {
            <h1>{{ 'book.s4' | translate }}</h1>
            <p class="lead">{{ 'book.s4Lead' | translate }}</p>
            <div class="two">
            <div>
            <section class="panel sum">
              <dl>
                <dt>{{ 'book.when' | translate }}</dt><dd>{{ whenText(slot()!.start) }}</dd>
                <dt>{{ 'book.where' | translate }}</dt><dd>{{ whereText() }}</dd>
                <dt>{{ 'book.payment' | translate }}</dt><dd>{{ payment() ? ('payment.' + payment() | translate) : ('detail.notSet' | translate) }}</dd>
              </dl>
            </section>
            @if (quote(); as q) {
              <h2 class="section-title">{{ 'detail.services' | translate }}</h2>
              <section class="panel sum">
                <dl>
                  @for (it of q.items; track $index) { <dt>{{ line(it) }}</dt><dd class="ltr">{{ it.totalHalalas | sar }}</dd> }
                  @if (q.discountHalalas) {
                    <dt>{{ 'promo.discount' | translate: { code: q.promo?.code ?? '' } }}</dt>
                    <dd class="ltr off">−{{ q.discountHalalas | sar }}</dd>
                    <div class="total" style="display: contents">
                      <dt>{{ 'detail.total' | translate }}</dt><dd class="ltr">{{ (q.totalHalalas ?? q.subtotalHalalas) | sar }}</dd>
                    </div>
                  }
                </dl>
              </section>
            }

            </div>
            <section class="panel">
            <h2 class="section-title" style="margin-top:0">{{ 'promo.fieldTitle' | translate }}</h2>
            @if (quote()?.promo; as pr) {
              <div class="promo-ok" role="status">
                <i class="pi pi-ticket" aria-hidden="true"></i>
                <span>
                  <b class="ltr">{{ pr.code }}</b> · {{ 'promo.saved' | translate: { v: ((quote()?.discountHalalas ?? 0) | sar) } }}
                  <small>{{ (lang.current() === 'en' && pr.titleEn) || pr.title }}</small>
                </span>
                <button type="button" (click)="removePromo()">{{ 'promo.remove' | translate }}</button>
              </div>
            } @else {
              <form class="promo" (ngSubmit)="applyPromo()">
                <input class="input ltr" name="promo" [(ngModel)]="promoInput" maxlength="30" autocomplete="off" autocapitalize="characters"
                       [placeholder]="'promo.placeholder' | translate" [attr.aria-label]="'promo.fieldTitle' | translate" />
                <button type="submit" class="btn btn-quiet" [disabled]="!promoInput.trim() || checkingPromo()">
                  @if (checkingPromo()) { <i class="pi pi-spin pi-spinner"></i> } @else { {{ 'promo.apply' | translate }} }
                </button>
              </form>
              @if (promoError()) { <p class="promo-err" role="alert">{{ promoError() }}</p> }
            }
            <p class="muted" style="font-size:.88rem; margin-top:14px">{{ 'book.confirmNote' | translate }}</p>
            </section>
            </div>
          }
        }
      }
    </div>

    @if (!booked() && store.company()?.bookingOpen) {
      <div class="footer">
        <div class="in">
          <div class="cell svc-cell">
            <span class="ico"><i class="pi pi-file-edit" aria-hidden="true"></i></span>
            <span>
              <small>{{ 'book.selectedService' | translate }}</small>
              <b>
                @switch (picks().length) {
                  @case (0) { — }
                  @case (1) { {{ picks()[0].service | svc }} }
                  @default { {{ 'book.servicesN' | translate: { n: picks().length } }} }
                }
              </b>
            </span>
          </div>
          @if (singleQty(); as q) {
            <span class="vbar hide-sm" aria-hidden="true"></span>
            <div class="cell hide-sm">
              <small>{{ 'book.qty.' + q.type | translate }}</small>
              <b class="tnum">{{ q.value }} {{ 'book.unit.' + q.type | translate }}</b>
            </div>
          }
          <span class="vbar hide-sm" aria-hidden="true"></span>
          <div class="cell total">
            <small>{{ 'detail.total' | translate }}</small>
            <b class="ltr">{{ (quote()?.totalHalalas ?? quote()?.subtotalHalalas ?? 0) | sar }}@if (quote()?.discountHalalas) { <s>{{ quote()!.subtotalHalalas | sar }}</s> }</b>
          </div>
          <div class="actions">
            @if (step() > 1) { <button type="button" class="btn-soft" (click)="back()">{{ 'book.back' | translate }}</button> }
            @if (step() < 4) {
              <button type="button" class="btn-main" [disabled]="!canNext()" (click)="forward()">
                {{ 'book.next' | translate }}<i class="pi pi-arrow-right rtl-flip" aria-hidden="true"></i>
              </button>
            } @else {
              <button type="button" class="btn-main" [disabled]="busy()" (click)="submit()">
                {{ 'book.confirm' | translate }}<i class="pi pi-check" aria-hidden="true"></i>
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class BookPage implements OnInit, OnDestroy {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);
  protected readonly lang = inject(LanguageService);

  protected readonly payments = PAYMENTS;
  protected readonly step = signal<Step>(1);
  protected readonly services = signal<Service[]>([]);
  protected readonly picks = signal<Pick[]>([]);
  /** Labels of the four steps, for the stepper. */
  protected readonly stepNames = ['book.stepService', 'book.stepSchedule', 'book.stepLocation', 'book.stepConfirm'];
  /** With one measured service picked, its quantity for the summary bar (e.g. "Area 100 m²"). */
  protected readonly singleQty = computed(() => {
    const l = this.picks();
    if (l.length !== 1 || l[0].service.pricingType === 'FIXED') return null;
    return { type: l[0].service.pricingType, value: l[0].quantity };
  });
  /** The service chosen on the company page (?service=): shown alone until "Add another service". */
  protected readonly focused = signal<Service | null>(null);
  protected readonly quote = signal<Quote | null>(null);
  protected readonly date = signal('');
  protected readonly slots = signal<Slot[]>([]);
  protected readonly slot = signal<Slot | null>(null);
  protected readonly loadingSlots = signal(false);
  protected readonly addresses = signal<Address[]>([]);
  protected readonly addressId = signal<string | null>(null);
  protected readonly payment = signal<PaymentMethod | null>(null);
  protected readonly busy = signal(false);
  protected readonly booked = signal<Booked | null>(null);
  protected city = '';
  protected district = '';
  protected details = '';
  protected mapUrl = '';
  protected notes = '';

  private readonly quote$ = new Subject<void>();

  // --- promo code ---
  protected promoInput = '';
  /** The code sent with every quote; the server's answer says whether it applies. */
  private readonly promoCode = signal<string | null>(null);
  protected readonly promoError = signal<string | null>(null);
  protected readonly checkingPromo = signal(false);

  protected readonly days = computed(() => {
    const c = this.store.company();
    const lang = this.lang.current();
    const out: { iso: string; weekday: string; day: string; month: string }[] = [];
    const today = new Date();
    for (let i = 0; i < Math.min(c?.maxDaysAhead ?? 30, 21); i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ iso, weekday: formatDate(d, 'weekday', lang), day: formatDate(d, 'dayNum', lang), month: formatDate(d, 'month', lang) });
    }
    return out;
  });

  protected readonly canNext = computed(() => {
    switch (this.step()) {
      case 1:
        return this.picks().length > 0 && !!this.quote();
      case 2:
        return !!this.slot();
      default:
        return true;
    }
  });

  private readonly route = inject(ActivatedRoute);

  /** A price-summary line in the visitor's language. */
  protected line(item: Quote['items'][number]): string {
    return quoteLine(item, this.services(), this.lang.current());
  }

  ngOnInit(): void {
    const slug = this.store.slug();
    // ?service=<id> comes from the public company page: start with that service picked.
    const preselect = this.route.snapshot.queryParamMap.get('service');
    // ?promo=CODE comes from the announcement bar: try it as soon as there is something to price.
    const promo = this.normalizeCode(this.route.snapshot.queryParamMap.get('promo') ?? '');
    if (promo) {
      this.promoInput = promo;
      this.promoCode.set(promo);
    }
    this.api.services(slug).subscribe({
      next: (s) => {
        this.services.set(s);
        const chosen = preselect ? s.find((x) => x.id === preselect) : undefined;
        if (chosen && !this.picked(chosen)) {
          this.toggle(chosen);
          this.focused.set(chosen);
          // The company page's cost estimator also passes ?qty= and ?addons=a,b: start from that estimate.
          const pick = this.pickOf(chosen);
          const params = this.route.snapshot.queryParamMap;
          const qty = Number(params.get('qty'));
          const addons = (params.get('addons') ?? '').split(',').filter((id) => chosen.addons.some((a) => a.id === id));
          if (pick && chosen.pricingType !== 'FIXED' && qty > 0) {
            this.setQty(pick, qty);
          }
          if (pick && addons.length) {
            addons.forEach((id) => this.toggleAddon(pick, id));
          }
        }
      },
      error: (e) => this.fail(e),
    });
    this.api.me(slug).subscribe({
      next: (p) => {
        this.addresses.set(p.addresses);
        this.addressId.set(p.addresses.at(-1)?.id ?? null);
      },
    });
    this.quote$
      .pipe(
        debounceTime(200),
        switchMap(() =>
          this.items().length ? this.api.quote(slug, this.items(), this.promoCode()).pipe(catchError(() => of(null))) : of(null),
        ),
      )
      .subscribe((q) => this.onQuote(q));
  }

  ngOnDestroy(): void {
    this.quote$.complete();
  }

  // --- step 1 ---
  protected icon(s: Service): string {
    return serviceIcon(s.name, s.nameEn);
  }

  protected defaultImage(s: Service): string {
    return defaultServiceImage(s.name, s.nameEn);
  }

  /** An uploaded photo that can't be loaded falls back to the default picture (once). */
  protected imageFailed(e: Event, s: Service): void {
    const img = e.target as HTMLImageElement;
    const fallback = this.defaultImage(s);
    if (!img.src.endsWith(fallback)) img.src = fallback;
  }

  protected picked(s: Service): boolean {
    return this.picks().some((p) => p.service.id === s.id);
  }

  protected pickOf(s: Service): Pick | undefined {
    return this.picks().find((p) => p.service.id === s.id);
  }

  protected step1(s: Service): number {
    return s.pricingType === 'PER_SQM' ? 10 : 1;
  }

  toggle(s: Service): void {
    this.picks.update((l) =>
      this.picked(s)
        ? l.filter((p) => p.service.id !== s.id)
        : [...l, { service: s, quantity: s.pricingType === 'HOURLY' ? 3 : s.pricingType === 'PER_SQM' ? 100 : 1, addonIds: [] }],
    );
    this.changed();
  }

  setQty(p: Pick, q: number): void {
    p.quantity = Math.max(this.step1(p.service), Math.min(p.service.pricingType === 'PER_SQM' ? 5000 : 24, q));
    this.picks.update((l) => [...l]);
    this.changed();
  }

  toggleAddon(p: Pick, id: string): void {
    p.addonIds = p.addonIds.includes(id) ? p.addonIds.filter((x) => x !== id) : [...p.addonIds, id];
    this.picks.update((l) => [...l]);
    this.changed();
  }

  private items(): Item[] {
    return this.picks().map((p) => ({
      serviceId: p.service.id,
      quantity: p.service.pricingType === 'FIXED' ? null : p.quantity,
      addonIds: p.addonIds,
    }));
  }

  private changed(): void {
    this.slot.set(null);
    this.slots.set([]);
    this.date.set('');
    this.quote$.next();
  }

  // --- step 2 ---
  pickDate(iso: string): void {
    this.date.set(iso);
    this.slot.set(null);
    this.loadingSlots.set(true);
    this.api.availability(this.store.slug(), iso, this.items()).subscribe({
      next: (s) => {
        this.slots.set(s);
        this.loadingSlots.set(false);
      },
      error: (e) => {
        this.loadingSlots.set(false);
        this.fail(e);
      },
    });
  }

  // --- step 3/4 ---
  protected addressLine(a: Address): string {
    return [a.district, a.city, a.details].filter(Boolean).join('، ');
  }

  protected whereText(): string {
    const id = this.addressId();
    if (id) {
      const a = this.addresses().find((x) => x.id === id);
      return a ? this.addressLine(a) || a.label || '' : '';
    }
    return [this.district, this.city, this.details].map((s) => s.trim()).filter(Boolean).join('، ') ||
      this.translate.instant('detail.noAddress');
  }

  protected whenText(iso: string): string {
    const lang = this.lang.current();
    return `${formatDate(iso, 'day', lang)} ${formatDate(iso, 'time', lang)}`;
  }

  forward(): void {
    if (this.step() === 1 && !this.date()) {
      this.pickDate(this.days()[0].iso);
    }
    this.step.update((s) => Math.min(4, s + 1) as Step);
    window.scrollTo({ top: 0 });
  }

  back(): void {
    this.step.update((s) => Math.max(1, s - 1) as Step);
  }

  protected applyPromo(): void {
    const code = this.normalizeCode(this.promoInput);
    this.promoInput = code;
    this.promoError.set(null);
    if (!code) return;
    this.promoCode.set(code);
    this.checkingPromo.set(true);
    this.quote$.next();
  }

  protected removePromo(): void {
    this.promoCode.set(null);
    this.promoInput = '';
    this.promoError.set(null);
    this.quote$.next();
  }

  /** The price came back: if the code was refused, say why and price without it. */
  private onQuote(q: Quote | null): void {
    const asked = this.checkingPromo();
    this.checkingPromo.set(false);
    if (q?.promoError && this.promoCode()) {
      // A code from the announcement link that no longer fits is dropped quietly until the customer tries one.
      if (asked) this.promoError.set(this.promoMessage(q.promoError));
      this.promoCode.set(null);
      this.quote.set({ ...q, discountHalalas: 0, totalHalalas: q.subtotalHalalas, promo: undefined });
      return;
    }
    this.quote.set(q);
  }

  private promoMessage(code: string): string {
    const key = `errors.${code}`;
    const text = this.translate.instant(key);
    return text !== key ? text : this.translate.instant('errors.promo_not_found');
  }

  private normalizeCode(v: string): string {
    return v.trim().toUpperCase().replace(/\s+/g, '');
  }

  submit(): void {
    const slot = this.slot();
    if (!slot) {
      return;
    }
    this.busy.set(true);
    const newAddress = this.addressId() === null && (this.city || this.district || this.details || this.mapUrl)
      ? { city: this.city || null, district: this.district || null, details: this.details || null, mapUrl: this.mapUrl || null }
      : null;
    this.api
      .book(this.store.slug(), {
        items: this.items(),
        scheduledStart: slot.start,
        addressId: this.addressId(),
        address: newAddress,
        notes: this.notes.trim() || null,
        paymentMethod: this.payment(),
        promoCode: this.quote()?.promo?.code ?? null,
      })
      .subscribe({
        next: (b) => {
          this.busy.set(false);
          this.booked.set(b);
        },
        error: (e) => {
          this.busy.set(false);
          const code = (e?.error as { code?: string } | null)?.code;
          if (code?.startsWith('promo_')) {
            // The code stopped applying since it was checked (used up, expired...): price without it.
            this.promoError.set(this.promoMessage(code));
            this.promoCode.set(null);
            this.quote$.next();
            this.busy.set(false);
            return;
          }
          if (code === 'slot_unavailable') {
            // Someone took it meanwhile: back to the times, refreshed.
            this.step.set(2);
            this.pickDate(this.date());
          }
          this.fail(e);
        },
      });
  }

  private fail(e: unknown): void {
    this.toasts.show(errorMessage(e, this.translate), 'error');
  }
}
