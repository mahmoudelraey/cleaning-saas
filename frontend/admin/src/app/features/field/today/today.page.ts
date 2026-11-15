import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';

import { BookingStatus } from '../../../core/api.types';
import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../core/http/api-error';
import { BookingStatusTag } from '../../../shared/booking-status/booking-status';
import { LocalDatePipe, LocalTimeRangePipe } from '../../../shared/local-date.pipe';
import { BookingsApi } from '../../bookings/bookings.api';
import { FieldApi, VisitCard } from '../field.api';

/** Technician home (PWA): today's visits as big, thumb-friendly cards. */
@Component({
  selector: 'app-today',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, SelectButton, BookingStatusTag, LocalDatePipe, LocalTimeRangePipe],
  styleUrl: './today.page.scss',
  templateUrl: './today.page.html',
})
export class TodayPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(FieldApi);
  private readonly bookings = inject(BookingsApi);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly offset = signal(0);
  protected readonly visits = signal<VisitCard[]>([]);
  protected readonly busyId = signal<string | null>(null);

  protected readonly day = computed(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + this.offset());
  });
  protected readonly doneCount = computed(() => this.visits().filter((v) => v.status === 'COMPLETED').length);
  protected readonly dayOptions = computed(() => [
    { value: -1, label: this.translate.instant('field.yesterday') },
    { value: 0, label: this.translate.instant('calendar.today') },
    { value: 1, label: this.translate.instant('field.tomorrow') },
  ]);

  ngOnInit(): void {
    this.load();
  }

  setOffset(v: number): void {
    this.offset.set(v);
    this.load();
  }

  /** The obvious next step; "no-show" stays on the visit page to avoid accidental taps. */
  primary(v: VisitCard): BookingStatus | null {
    return v.allowedTransitions.find((t) => t !== 'NO_SHOW') ?? null;
  }

  advance(v: VisitCard, next: BookingStatus): void {
    this.busyId.set(v.id);
    this.bookings.changeStatus(v.id, next).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  private load(): void {
    const d = this.day();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.api.myVisits(date).subscribe((v) => this.visits.set(v));
  }
}
