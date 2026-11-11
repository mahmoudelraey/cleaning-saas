import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { BookingSummary } from '../core/api.types';

/** Where a visit stands: booked → technician assigned → on the way → done, with a line on what happens next. */
@Component({
  selector: 'pt-visit-tracker',
  imports: [TranslatePipe],
  styles: `
    :host { display: flex; flex-direction: column; justify-content: center; gap: 22px; }
    .steps { display: grid; grid-template-columns: repeat(4, 1fr); list-style: none; margin: 0; padding: 0; }
    .steps li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
                font-weight: 800; color: #94a3b8; font-size: .95rem; }
    .steps li:not(:last-child)::after { content: ''; position: absolute; top: 27px; inset-inline-start: calc(50% + 30px);
                                        width: calc(100% - 60px); height: 3px; border-radius: 3px; background: #dbe7e3; }
    .steps li.past:not(:last-child)::after { background: #149b74; }
    .dot { position: relative; z-index: 1; width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center;
           font-size: 1.3rem; background: #f1f5f4; color: #94a3b8; }
    .steps li.past, .steps li.now { color: #0f172a; }
    .steps li.past .dot { background: #e2f4ee; color: #149b74; }
    .steps li.now .dot { background: #0d5c46; color: #fff; box-shadow: 0 0 0 7px rgba(20, 155, 116, .15); }
    .note { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0; padding: 14px 18px; border-radius: 18px;
            background: #eef8f4; color: #0d5c46; font-weight: 600; font-size: .92rem; text-align: center; }
    .note.bad { background: #fdecec; color: #b42318; }
    @media (max-width: 599px) {
      .steps li { font-size: .74rem; }
      .dot { width: 40px; height: 40px; font-size: 1rem; }
      .steps li:not(:last-child)::after { top: 20px; inset-inline-start: calc(50% + 23px); width: calc(100% - 46px); }
    }
  `,
  template: `
    @let b = booking();
    @if (stopped()) {
      <p class="note bad" role="status"><i class="pi pi-times-circle" aria-hidden="true"></i>{{ 'status.' + b.status | translate }}</p>
    } @else {
      <ol class="steps">
        @for (st of stages; track st.key; let i = $index) {
          <li [class.past]="i < stage()" [class.now]="i === stage()">
            <span class="dot"><i class="pi" [class]="i < stage() ? 'pi-check' : st.icon" aria-hidden="true"></i></span>
            {{ (i === 3 && b.status === 'IN_PROGRESS' ? 'status.IN_PROGRESS' : st.key) | translate }}
          </li>
        }
      </ol>
      @if (b.status !== 'COMPLETED') {
        <p class="note" role="status"><i class="pi pi-info-circle" aria-hidden="true"></i>{{ noteKey() | translate: { name: techNames() } }}</p>
      }
    }
  `,
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
