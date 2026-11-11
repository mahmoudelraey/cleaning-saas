import { HttpClient } from '@angular/common/http';
import { Component, OnChanges, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { Message } from 'primeng/message';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { NotificationSettings } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';

/**
 * Which customer messages a company sends, and when the reminder goes out. Only the platform admin changes this,
 * from Platform → Companies → a company (the panel is given that company's id).
 */
@Component({
  selector: 'app-notification-settings',
  imports: [FormsModule, TranslatePipe, Button, InputNumber, Message, ToggleSwitch],
  styles: `
    h2 { margin: 0 0 .25rem; font-size: 1.05rem; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .7rem 0; border-bottom: 1px solid var(--fo-border); }
    .row:last-of-type { border-bottom: none; }
    .row small { display: block; color: var(--fo-muted); }
    .hours { display: flex; align-items: center; gap: .5rem; }
    .providers { display: flex; gap: .5rem; flex-wrap: wrap; margin: .75rem 0; }
  `,
  template: `
    <h2>{{ 'notifySettings.title' | translate }}</h2>
    <p class="muted">{{ 'notifySettings.subtitle' | translate }}</p>

    @if (s(); as v) {
      <div class="providers">
        @if (!v.whatsappConfigured && !v.smsConfigured) {
          <p-message severity="warn">{{ 'notifySettings.noProvider' | translate }}</p-message>
        } @else {
          <p-message severity="success">
            {{ 'notifySettings.active' | translate }}:
            {{ v.whatsappConfigured ? 'WhatsApp' : '' }}{{ v.whatsappConfigured && v.smsConfigured ? ' + ' : '' }}{{ v.smsConfigured ? 'SMS' : '' }}
          </p-message>
        }
      </div>

      @for (k of keys; track k) {
        <div class="row">
          <label [for]="'n-' + k">{{ 'notifySettings.' + k | translate }}<small>{{ 'notifySettings.' + k + 'Hint' | translate }}</small></label>
          <p-toggleswitch [inputId]="'n-' + k" [(ngModel)]="v[k]" [disabled]="!canEdit" />
        </div>
      }
      <div class="row">
        <label for="n-hours">{{ 'notifySettings.reminderHours' | translate }}</label>
        <span class="hours">
          <p-inputnumber inputId="n-hours" [(ngModel)]="v.reminderHours" [min]="1" [max]="48" [showButtons]="true" [disabled]="!canEdit || !v.reminder" />
          <span class="muted">{{ 'notifySettings.hoursBefore' | translate }}</span>
        </span>
      </div>
      @if (canEdit) {
        <div class="dialog-actions">
          <p-button [label]="'common.save' | translate" [loading]="saving()" (onClick)="save(v)" />
        </div>
      }
    }
  `,
})
export class NotificationSettingsPanel implements OnChanges {
  /** The company whose messages are shown and changed. */
  readonly companyId = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  readonly canEdit = true;
  protected readonly keys = ['confirmation', 'reminder', 'onTheWay', 'completed', 'cancelled'] as const;
  protected readonly s = signal<NotificationSettings | null>(null);
  protected readonly saving = signal(false);

  private url(): string {
    return `/api/platform/companies/${this.companyId()}/customer-messages`;
  }

  ngOnChanges(): void {
    this.s.set(null);
    this.http.get<NotificationSettings>(this.url()).subscribe((v) => this.s.set(v));
  }

  save(v: NotificationSettings): void {
    this.saving.set(true);
    const { whatsappConfigured, smsConfigured, ...body } = v;
    this.http.put<NotificationSettings>(this.url(), body).subscribe({
      next: (res) => {
        this.s.set(res);
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (err) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }
}
