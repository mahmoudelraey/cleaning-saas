import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { BookingSummary } from '../../core/api.types';

/** Where a visit stands: booked → technician assigned → on the way → done, with a line on what happens next. */
@Component({
  selector: 'pt-visit-tracker',
  imports: [TranslatePipe],
  styleUrl: './visit-tracker.scss',
  templateUrl: './visit-tracker.html',
})
export class VisitTracker {
  readonly booking = input.required<BookingSummary>();

  protected readonly stages = [
    { key: 'home.stageBooked', icon: 'pi-calendar' },
    { key: 'home.stageTechnician', icon: 'pi-user' },
    { key: 'home.stageOnTheWay', icon: 'pi-car' },
    { key: 'home.stageDone', icon: 'pi-check' },
  ];

  protected readonly stopped = computed(() => ['CANCELLED', 'NO_SHOW'].includes(this.booking().status));

  /** 0 booked (new / confirmed), 1 technician assigned, 2 on the way, 3 working / done. */
  protected readonly stage = computed(() => {
    switch (this.booking().status) {
      case 'ASSIGNED':
        return 1;
      case 'ON_THE_WAY':
        return 2;
      case 'IN_PROGRESS':
      case 'COMPLETED':
        return 3;
      default:
        return 0;
    }
  });

  protected readonly techNames = computed(() => this.booking().technicians.map((t) => t.name).join('، '));

  /** One line on what happens next, from the visit's status. */
  protected readonly noteKey = computed(() => {
    const b = this.booking();
    switch (b.status) {
      case 'NEW':
      case 'ON_THE_WAY':
      case 'IN_PROGRESS':
        return `home.note${b.status}`;
      case 'ASSIGNED':
        return b.technicians.length ? 'home.noteASSIGNED' : 'home.noteCONFIRMED';
      default:
        return 'home.noteCONFIRMED';
    }
  });
}
