import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { GeneralSettings, MessagingInput, MessagingView, PlanRow, PlatformApi, Secret } from '../platform.api';

type SecretKey = 'whatsappAccessToken' | 'whatsappAppSecret' | 'whatsappVerifyToken' | 'smsAppSid';

/**
 * Platform settings: trial length and plan for new signups, grace period after a paid period ends, the support
 * contact companies see, and the platform's WhatsApp Cloud API and Unifonic SMS credentials and URLs.
 */
@Component({
  selector: 'app-platform-settings',
  imports: [FormsModule, TranslatePipe, Button, InputNumber, InputText, Password, Select, Tag, ToggleSwitch, LocalDatePipe],
  styleUrl: './settings.page.scss',
  templateUrl: './settings.page.html',
})
export class PlatformSettingsPage {
  private readonly api = inject(PlatformApi);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  private readonly lang = inject(LanguageService);

  protected readonly general = signal<GeneralSettings | null>(null);
  protected readonly msg = signal<MessagingView | null>(null);
  protected readonly plans = signal<PlanRow[]>([]);
  protected readonly savingGeneral = signal(false);
  protected readonly savingMsg = signal(false);
  protected readonly testing = signal<'WHATSAPP' | 'SMS' | null>(null);
  protected readonly testResult = signal<{ ok: boolean; message: string } | null>(null);
  protected testPhone = '';

  /** Editable copy of the non-secret messaging fields. */
  protected form: MessagingInput = emptyForm();
  /** Typed secrets: undefined = keep, '' = clear, text = replace. */
  protected secrets: Partial<Record<SecretKey, string>> = {};

  protected readonly waSecrets: { key: Exclude<SecretKey, 'smsAppSid'>; label: string }[] = [
    { key: 'whatsappAccessToken', label: 'Access token' },
    { key: 'whatsappAppSecret', label: 'App secret' },
    { key: 'whatsappVerifyToken', label: 'Webhook verify token' },
  ];

  protected readonly planOptions = computed(() =>
    this.plans().filter((p) => p.active).map((p) => ({ value: p.id, label: this.lang.current() === 'ar' ? p.nameAr : p.nameEn })),
  );
  protected readonly webhookUrl = computed(() => `${location.origin}${this.msg()?.webhookPath ?? '/api/v1/webhooks/whatsapp'}`);

  constructor() {
    this.api.general().subscribe({ next: (g) => this.general.set(g), error: (e) => this.fail(e) });
    this.api.plans().subscribe({ next: (p) => this.plans.set(p.plans), error: () => {} });
    this.api.messaging().subscribe({ next: (m) => this.setMessaging(m), error: (e) => this.fail(e) });
  }

  private setMessaging(m: MessagingView): void {
    this.msg.set(m);
    this.secrets = {};
    this.form = {
      whatsappEnabled: m.whatsappEnabled,
      whatsappApiUrl: m.whatsappApiUrl,
      whatsappApiVersion: m.whatsappApiVersion,
      whatsappPhoneNumberId: m.whatsappPhoneNumberId,
      whatsappBusinessAccountId: m.whatsappBusinessAccountId,
      whatsappAccessToken: null,
      whatsappAppSecret: null,
      whatsappVerifyToken: null,
      whatsappLanguage: m.whatsappLanguage,
      whatsappTemplates: { ...m.whatsappTemplates },
      smsEnabled: m.smsEnabled,
      smsApiUrl: m.smsApiUrl,
      smsAppSid: null,
      smsSenderId: m.smsSenderId,
    };
  }

  protected placeholder(s: Secret): string {
    return s.set ? this.translate.instant('platform.settings.savedKeep', { h: s.hint ?? '' }) : this.translate.instant('platform.settings.notSet');
  }

  protected saveGeneral(g: GeneralSettings): void {
    this.savingGeneral.set(true);
    this.api.saveGeneral(g).subscribe({
      next: (r) => {
        this.general.set(r);
        this.savingGeneral.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (e) => {
        this.savingGeneral.set(false);
        this.fail(e);
      },
    });
  }

  protected saveMessaging(): void {
    const body: MessagingInput = {
      ...this.form,
      whatsappAccessToken: this.secrets.whatsappAccessToken ?? null,
      whatsappAppSecret: this.secrets.whatsappAppSecret ?? null,
      whatsappVerifyToken: this.secrets.whatsappVerifyToken ?? null,
      smsAppSid: this.secrets.smsAppSid ?? null,
    };
    this.savingMsg.set(true);
    this.api.saveMessaging(body).subscribe({
      next: (m) => {
        this.setMessaging(m);
        this.savingMsg.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (e) => {
        this.savingMsg.set(false);
        this.fail(e);
      },
    });
  }

  protected test(channel: 'WHATSAPP' | 'SMS'): void {
    this.testing.set(channel);
    this.testResult.set(null);
    this.api.test(channel, this.testPhone).subscribe({
      next: (r) => {
        this.testing.set(null);
        this.testResult.set(r);
      },
      error: (e) => {
        this.testing.set(null);
        this.testResult.set({ ok: false, message: errorMessage(e, this.translate) });
      },
    });
  }

  protected copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => this.messages.add({ severity: 'success', summary: this.translate.instant('common.copied') }));
  }

  private fail(e: unknown): void {
    this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
  }
}

function emptyForm(): MessagingInput {
  return {
    whatsappEnabled: false,
    whatsappApiUrl: null,
    whatsappApiVersion: null,
    whatsappPhoneNumberId: null,
    whatsappBusinessAccountId: null,
    whatsappAccessToken: null,
    whatsappAppSecret: null,
    whatsappVerifyToken: null,
    whatsappLanguage: 'ar',
    whatsappTemplates: {},
    smsEnabled: false,
    smsApiUrl: null,
    smsAppSid: null,
    smsSenderId: null,
  };
}
