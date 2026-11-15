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
import { VisitTracker } from '../../shared/visit-tracker/visit-tracker';
import { SessionService } from '../../core/session.service';

/**
 * The customer's own page ("My visits"): the next visit as a green card with where it stands (booked →
 * technician → done), quick actions, and the last visits. Everything comes from the customer's bookings.
 */
@Component({
  selector: 'pt-home',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, SarPipe, VisitServicesPipe, VisitTracker],
  styleUrl: './home.page.scss',
  templateUrl: './home.page.html',
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

