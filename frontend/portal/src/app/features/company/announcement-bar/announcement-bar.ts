import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CompanyStore } from '../../../core/company.store';
import { LocalDatePipe, SarPipe } from '../../../core/format';
import { LanguageService } from '../../../core/language.service';

/**
 * The promo the company announces (admin → Promotions → "Announce on company page"), as a bar above the header:
 * its text, the code (tap to copy) and a link that opens booking with the code filled in. Can be closed; it stays
 * closed for that code until the browser tab is closed.
 */
@Component({
  selector: 'pt-announcement-bar',
  imports: [RouterLink, TranslatePipe, SarPipe, LocalDatePipe],
  styleUrl: './announcement-bar.scss',
  templateUrl: './announcement-bar.html',
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
