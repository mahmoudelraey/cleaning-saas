import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { BookingStatus } from '../../core/api.types';

const FLOW: BookingStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];

/** Where the visit is, as six segments with the current step named underneath. */
@Component({
  selector: 'pt-status-rail',
  imports: [TranslatePipe],
  styleUrl: './status-rail.scss',
  templateUrl: './status-rail.html',
})
export class StatusRail {
  readonly status = input.required<BookingStatus>();
  protected readonly flow = FLOW;
  protected readonly index = computed(() => FLOW.indexOf(this.status()));
  protected readonly stopped = computed(() => this.status() === 'CANCELLED' || this.status() === 'NO_SHOW');
}
