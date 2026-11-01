import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { BookingStatus } from '../core/api.types';

const FLOW: BookingStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];

/** Where the visit is, as six segments with the current step named underneath. */
@Component({
  selector: 'pt-status-rail',
  imports: [TranslatePipe],
  styles: `
    :host { display: block; }
    .rail { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
    .seg { height: 6px; border-radius: 99px; background: var(--line); }
    .seg.done { background: var(--tide); }
    .seg.now { background: var(--sun); }
    :host(.light) .seg { background: rgba(255, 255, 255, .22); }
    :host(.light) .seg.done { background: #fff; }
    :host(.light) .seg.now { background: var(--sun); }
    .label { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: .86rem; }
    .label strong { font-weight: 700; }
    .label span { opacity: .75; }
    .stopped { font-weight: 700; color: var(--rose); font-size: .9rem; }
    :host(.light) .stopped { color: #ffd2cf; }
  `,
  template: `
    @if (stopped()) {
      <div class="stopped"><i class="pi pi-times-circle"></i> {{ 'status.' + status() | translate }}</div>
    } @else {
      <div class="rail" role="img" [attr.aria-label]="'status.' + status() | translate">
        @for (s of flow; track s; let i = $index) {
          <span class="seg" [class.done]="i < index() || status() === 'COMPLETED'" [class.now]="i === index() && status() !== 'COMPLETED'"></span>
        }
      </div>
      <div class="label">
        <strong>{{ 'status.' + status() | translate }}</strong>
        @if (status() !== 'COMPLETED') { <span>{{ 'statusHint.' + status() | translate }}</span> }
      </div>
    }
  `,
})
export class StatusRail {
  readonly status = input.required<BookingStatus>();
  protected readonly flow = FLOW;
  protected readonly index = computed(() => FLOW.indexOf(this.status()));
  protected readonly stopped = computed(() => this.status() === 'CANCELLED' || this.status() === 'NO_SHOW');
}
