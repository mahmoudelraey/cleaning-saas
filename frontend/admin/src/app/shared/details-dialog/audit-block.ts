import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AuditInfo } from '../../core/api.types';
import { LocalDatePipe } from '../local-date.pipe';

/** "Created on … by …, last updated on … by …" as a small card (details dialogs). */
@Component({
  selector: 'app-audit-block',
  imports: [TranslatePipe, LocalDatePipe],
  template: `
    @if (audit(); as a) {
      <section class="fo-sec fo-audit">
        <div class="fo-sec-head"><div><h3><i class="pi pi-history" aria-hidden="true"></i>{{ 'audit.title' | translate }}</h3></div></div>
        <div class="fo-details">
          <div class="fo-detail">
            <small>{{ 'audit.createdAt' | translate }}</small>
            <b>{{ a.createdAt ? (a.createdAt | ldate: 'medium') : '—' }}</b>
          </div>
          <div class="fo-detail">
            <small>{{ 'audit.createdBy' | translate }}</small>
            <b>{{ a.createdByName || ('audit.system' | translate) }}</b>
          </div>
          <div class="fo-detail">
            <small>{{ 'audit.updatedAt' | translate }}</small>
            <b>{{ a.updatedAt ? (a.updatedAt | ldate: 'medium') : '—' }}</b>
          </div>
          <div class="fo-detail">
            <small>{{ 'audit.updatedBy' | translate }}</small>
            <b>{{ a.updatedByName || ('audit.system' | translate) }}</b>
          </div>
        </div>
      </section>
    }
  `,
})
export class AuditBlock {
  readonly audit = input<AuditInfo | null | undefined>(null);
}


/** The "created by" table cell: the user's name, or "System / customer" when no staff user made it. */
@Component({
  selector: 'app-created-by',
  imports: [TranslatePipe, LocalDatePipe],
  template: `
    <span class="fo-created-by">
      <span class="who" [class.sys]="!audit()?.createdByName">{{ audit()?.createdByName || ('audit.system' | translate) }}</span>
      @if (audit()?.createdAt; as at) {
        <small>{{ at | ldate: 'dayMonthYear' }}</small>
      }
    </span>
  `,
})
export class CreatedBy {
  readonly audit = input<AuditInfo | null | undefined>(null);
}
