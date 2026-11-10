import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { LanguageService } from '../../core/language.service';

/**
 * The promo the company announces (admin → Promotions → "Announce on company page"), as a bar above the header:
 * its text, the code (tap to copy) and a link that opens booking with the code filled in. Can be closed; it stays
 * closed for that code until the browser tab is closed.
 */
@Component({
  selector: 'pt-announcement-bar',
  imports: [RouterLink, TranslatePipe, SarPipe, LocalDatePipe],
  styles: `
    :host { display: block; }
    .bar { position: relative; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px 12px;
           padding: 9px 44px; text-align: center; color: #fff; font-size: .85rem; font-weight: 500;
           background: linear-gradient(90deg, #0d5c46, #149b74); box-shadow: 0 1px 2px rgba(15, 23, 42, .1); }
    .tag { background: rgba(255, 255, 255, .2); padding: 2px 10px; border-radius: 999px; font-size: .72rem; font-weight: 800;
           animation: soft 2s ease-in-out infinite; }
    @keyframes soft { 50% { opacity: .65; } }
    @media (prefers-reduced-motion: reduce) { .tag { animation: none; } }
    strong { color: #ffc107; }
    .code { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-weight: 800; letter-spacing: .05em; color: #fff;
            background: rgba(0, 0, 0, .2); border: 1px solid rgba(255, 255, 255, .25); border-radius: 6px; padding: 2px 10px;
            cursor: pointer; }
    .code:hover { background: rgba(0, 0, 0, .3); }
    .code i { font-size: .75rem; opacity: .8; }
    .ends { opacity: .8; font-size: .78rem; }
    .go { color: #fff; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; }
    .go:hover { color: #ffc107; }
    .x { position: absolute; inset-inline-end: 10px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 50%;
         border: 0; background: transparent; color: #fff; cursor: pointer; opacity: .75; }
    .x:hover { opacity: 1; background: rgba(255, 255, 255, .15); }
    @media (max-width: 640px) { .bar { font-size: .8rem; padding: 8px 40px; } .ends { display: none; } }
  `,
  template: `
    @if (shown(); as a) {
      <div class="bar" role="region" [attr.aria-label]="'promo.region' | translate">
        <span class="tag">{{ 'promo.tag' | translate }}</span>
        <span>
          {{ title() }}
          @if (a.discountType === 'PERCENT') {
            · <strong class="ltr">{{ a.discountValue }}%</strong>
          } @else {
            · <strong class="ltr">{{ a.discountValue | sar }}</strong>
          }
        </span>
        <span>{{ 'promo.useCode' | translate }}</span>
        <button type="button" class="code ltr" (click)="copy(a.code)" [attr.aria-label]="'promo.copy' | translate: { code: a.code }">
          {{ copied() ? ('promo.copied' | translate) : a.code }}<i class="pi" [class]="copied() ? 'pi-check' : 'pi-copy'" aria-hidden="true"></i>
        </button>
        @if (a.endsAt) {
          <span class="ends">{{ 'promo.until' | translate: { d: (lastDay() | ldate: 'dayShort') } }}</span>
        }
        @if (store.company()?.bookingOpen) {
          <a class="go" [routerLink]="['/', store.slug(), 'book']" [queryParams]="{ promo: a.code }">{{ 'promo.bookNow' | translate }}</a>
        }
        <button type="button" class="x" (click)="close(a.code)" [attr.aria-label]="'promo.close' | translate"><i class="pi pi-times"></i></button>
      </div>
    }
  `,
})
export class AnnouncementBar {
  protected readonly store = inject(CompanyStore);
  private readonly lang = inject(LanguageService);

  private readonly closed = signal<string | null>(AnnouncementBar.readClosed());
  protected readonly copied = signal(false);

  protected readonly shown = computed(() => {
    const a = this.store.company()?.announcement;
    if (!a || this.closed() === a.code) return null;
    // The server only sends a promo that is valid now; this hides it once it ends while the page stays open.
    if (a.endsAt && new Date(a.endsAt) <= new Date()) return null;
    return a;
  });
  protected readonly title = computed(() => {
    const a = this.shown();
    return a ? (this.lang.current() === 'en' && a.titleEn) || a.title : '';
  });

  /** endsAt is the moment it stops (midnight after the last day): show the last day itself. */
  protected readonly lastDay = computed(() => {
    const end = this.shown()?.endsAt;
    return end ? new Date(new Date(end).getTime() - 1) : null;
  });

  protected copy(code: string): void {
    void navigator.clipboard?.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    });
  }

  protected close(code: string): void {
    this.closed.set(code);
    try {
      sessionStorage.setItem(AnnouncementBar.KEY, code);
    } catch {
      // Private mode or storage off: it just stays closed until the page reloads.
    }
  }

  private static readonly KEY = 'pt.promoClosed';

  private static readClosed(): string | null {
    try {
      return sessionStorage.getItem(AnnouncementBar.KEY);
    } catch {
      return null;
    }
  }
}
