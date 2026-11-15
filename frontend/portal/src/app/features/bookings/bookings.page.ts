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
import { VisitTracker } from '../../shared/visit-tracker/visit-tracker';

/**
 * My visits: the next visit at the top (green card with where it stands), quick actions, then all visits
 * (upcoming and past together, newest date first), each as a card with its date, service and status.
 */
@Component({
  selector: 'pt-bookings',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, VisitServicesPipe, VisitTracker],
  styleUrl: './bookings.page.scss',
  templateUrl: './bookings.page.html',
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
