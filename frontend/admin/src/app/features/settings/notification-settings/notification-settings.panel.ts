import { HttpClient } from '@angular/common/http';
import { Component, OnChanges, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { Message } from 'primeng/message';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { NotificationSettings } from '../../../core/api.types';
import { errorMessage } from '../../../core/http/api-error';

/**
 * Which customer messages a company sends, and when the reminder goes out. Only the platform admin changes this,
 * from Platform → Companies → a company (the panel is given that company's id).
 */
@Component({
  selector: 'app-notification-settings',
  imports: [FormsModule, TranslatePipe, Button, InputNumber, Message, ToggleSwitch],
  styleUrl: './notification-settings.panel.scss',
  templateUrl: './notification-settings.panel.html',
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
