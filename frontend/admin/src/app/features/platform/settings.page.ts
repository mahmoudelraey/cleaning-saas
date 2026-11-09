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

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { GeneralSettings, MessagingInput, MessagingView, PlanRow, PlatformApi, Secret } from './platform.api';

type SecretKey = 'whatsappAccessToken' | 'whatsappAppSecret' | 'whatsappVerifyToken' | 'smsAppSid';

/**
 * Platform settings: trial length and plan for new signups, grace period after a paid period ends, the support
 * contact companies see, and the platform's WhatsApp Cloud API and Unifonic SMS credentials and URLs.
 */
@Component({
  selector: 'app-platform-settings',
  imports: [FormsModule, TranslatePipe, Button, InputNumber, InputText, Password, Select, Tag, ToggleSwitch, LocalDatePipe],
  styles: `
    .panel { margin-bottom: 1rem; }
    h2 { font-size: 1.05rem; margin: 0 0 .25rem; display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .sub { color: var(--fo-muted); font-size: .85rem; margin: 0 0 1rem; }
    h3 { font-size: .95rem; margin: 1.25rem 0 .75rem; display: flex; align-items: center; gap: .5rem; }
    .secret { display: flex; gap: .4rem; align-items: center; }
    .secret p-password { flex: 1; }
    .copy { display: flex; gap: .4rem; align-items: center; background: #f8fafc; border-radius: 8px; padding: .5rem .75rem; font-family: monospace; font-size: .85rem; overflow-x: auto; }
    .templates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem 1rem; }
    @media (max-width: 640px) { .templates { grid-template-columns: 1fr; } }
    .templates label { font-size: .8rem; color: var(--fo-muted); font-family: monospace; }
    .test { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    .result { font-size: .85rem; padding: .5rem .75rem; border-radius: 8px; margin-top: .5rem; word-break: break-word; }
    .result.ok { background: #f0fdf4; color: #166534; } .result.bad { background: #fef2f2; color: #991b1b; }
    .save { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }
    .note { font-size: .82rem; color: var(--fo-muted); }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'platform.settings.title' | translate }}</h1>
        <p>{{ 'platform.settings.subtitle' | translate }}</p>
      </div>
    </div>

    @if (general(); as g) {
      <div class="panel">
        <h2>{{ 'platform.settings.subscriptions' | translate }}</h2>
        <p class="sub">{{ 'platform.settings.subscriptionsHint' | translate }}</p>
        <div class="form-grid">
          <div class="field">
            <label for="s-trial">{{ 'platform.settings.trialDays' | translate }}</label>
            <p-inputnumber inputId="s-trial" [(ngModel)]="g.trialDays" [min]="1" [max]="365" [suffix]="' ' + ('platform.days' | translate)" />
            <small class="hint">{{ 'platform.settings.trialDaysHint' | translate }}</small>
          </div>
          <div class="field">
            <label for="s-plan">{{ 'platform.settings.trialPlan' | translate }}</label>
            <p-select inputId="s-plan" [options]="planOptions()" [(ngModel)]="g.trialPlanId" optionLabel="label" optionValue="value" appendTo="body" />
          </div>
          <div class="field">
            <label for="s-grace">{{ 'platform.settings.graceDays' | translate }}</label>
            <p-inputnumber inputId="s-grace" [(ngModel)]="g.graceDays" [min]="0" [max]="90" [suffix]="' ' + ('platform.days' | translate)" />
            <small class="hint">{{ 'platform.settings.graceDaysHint' | translate }}</small>
          </div>
          <div class="field"></div>
          <div class="field">
            <label for="s-wa">{{ 'platform.settings.supportWhatsapp' | translate }}</label>
            <input pInputText id="s-wa" [(ngModel)]="g.supportWhatsapp" dir="ltr" placeholder="9665XXXXXXXX" />
            <small class="hint">{{ 'platform.settings.supportHint' | translate }}</small>
          </div>
          <div class="field">
            <label for="s-mail">{{ 'platform.settings.supportEmail' | translate }}</label>
            <input pInputText id="s-mail" [(ngModel)]="g.supportEmail" type="email" dir="ltr" />
          </div>
        </div>
        <div class="save"><p-button [label]="'common.save' | translate" [loading]="savingGeneral()" (onClick)="saveGeneral(g)" /></div>
      </div>
    }

    @if (msg(); as m) {
      <div class="panel">
        <h2>
          {{ 'platform.settings.messaging' | translate }}
          @if (!m.configured) { <p-tag severity="info" [value]="'platform.settings.fromEnv' | translate" /> }
        </h2>
        <p class="sub">{{ 'platform.settings.messagingHint' | translate }}
          @if (m.updatedAt && m.configured) { · {{ 'platform.settings.updated' | translate }} {{ m.updatedAt | ldate: 'medium' }} }</p>

        <h3>
          <i class="pi pi-whatsapp"></i> WhatsApp Cloud API
          <p-tag [severity]="m.whatsappReady ? 'success' : 'secondary'" [value]="(m.whatsappReady ? 'platform.settings.ready' : 'platform.settings.notReady') | translate" />
        </h3>
        <div class="form-grid">
          <div class="field">
            <label for="w-on">{{ 'platform.settings.enabled' | translate }}</label>
            <p-toggleswitch inputId="w-on" [(ngModel)]="form.whatsappEnabled" />
          </div>
          <div class="field">
            <label for="w-lang">{{ 'platform.settings.language' | translate }}</label>
            <input pInputText id="w-lang" [(ngModel)]="form.whatsappLanguage" dir="ltr" placeholder="ar" maxlength="10" />
          </div>
          <div class="field">
            <label for="w-url">{{ 'platform.settings.apiUrl' | translate }}</label>
            <input pInputText id="w-url" [(ngModel)]="form.whatsappApiUrl" dir="ltr" placeholder="https://graph.facebook.com" />
          </div>
          <div class="field">
            <label for="w-ver">{{ 'platform.settings.apiVersion' | translate }}</label>
            <input pInputText id="w-ver" [(ngModel)]="form.whatsappApiVersion" dir="ltr" placeholder="v21.0" maxlength="20" />
          </div>
          <div class="field">
            <label for="w-pid">Phone number ID</label>
            <input pInputText id="w-pid" [(ngModel)]="form.whatsappPhoneNumberId" dir="ltr" />
          </div>
          <div class="field">
            <label for="w-waba">WhatsApp Business Account ID</label>
            <input pInputText id="w-waba" [(ngModel)]="form.whatsappBusinessAccountId" dir="ltr" />
            <small class="hint">{{ 'platform.settings.wabaHint' | translate }}</small>
          </div>
          @for (k of waSecrets; track k.key) {
            <div class="field">
              <label [for]="'w-' + k.key">{{ k.label }}</label>
              <div class="secret">
                <p-password [inputId]="'w-' + k.key" [(ngModel)]="secrets[k.key]" [feedback]="false" [toggleMask]="true" [fluid]="true"
                            [placeholder]="placeholder(m[k.key])" autocomplete="off" />
                @if (m[k.key].set) {
                  <p-button icon="pi pi-times" [text]="true" severity="danger" (onClick)="secrets[k.key] = ''" [ariaLabel]="'platform.settings.clear' | translate" />
                }
              </div>
              @if (secrets[k.key] === '' && m[k.key].set) { <small class="hint">{{ 'platform.settings.willClear' | translate }}</small> }
            </div>
          }
          <div class="field full">
            <label>{{ 'platform.settings.webhook' | translate }}</label>
            <div class="copy"><span>{{ webhookUrl() }}</span>
              <p-button icon="pi pi-copy" [text]="true" size="small" (onClick)="copy(webhookUrl())" [ariaLabel]="'common.copy' | translate" /></div>
            <small class="hint">{{ 'platform.settings.webhookHint' | translate }}</small>
          </div>
        </div>

        <h3>{{ 'platform.settings.templates' | translate }}</h3>
        <p class="note">{{ 'platform.settings.templatesHint' | translate }}</p>
        <div class="templates">
          @for (t of m.templateKeys; track t) {
            <div class="field">
              <label [for]="'t-' + t">{{ t }}</label>
              <input pInputText [id]="'t-' + t" [(ngModel)]="form.whatsappTemplates[t]" dir="ltr" />
            </div>
          }
        </div>

        <h3>
          <i class="pi pi-comment"></i> SMS (Unifonic)
          <p-tag [severity]="m.smsReady ? 'success' : 'secondary'" [value]="(m.smsReady ? 'platform.settings.ready' : 'platform.settings.notReady') | translate" />
        </h3>
        <div class="form-grid">
          <div class="field">
            <label for="s-on">{{ 'platform.settings.enabled' | translate }}</label>
            <p-toggleswitch inputId="s-on" [(ngModel)]="form.smsEnabled" />
          </div>
          <div class="field">
            <label for="s-sender">Sender ID</label>
            <input pInputText id="s-sender" [(ngModel)]="form.smsSenderId" dir="ltr" maxlength="20" />
            <small class="hint">{{ 'platform.settings.senderHint' | translate }}</small>
          </div>
          <div class="field">
            <label for="s-url">{{ 'platform.settings.apiUrl' | translate }}</label>
            <input pInputText id="s-url" [(ngModel)]="form.smsApiUrl" dir="ltr" placeholder="https://el.cloud.unifonic.com" />
          </div>
          <div class="field">
            <label for="s-sid">AppSid</label>
            <div class="secret">
              <p-password inputId="s-sid" [(ngModel)]="secrets.smsAppSid" [feedback]="false" [toggleMask]="true" [fluid]="true" [placeholder]="placeholder(m.smsAppSid)" autocomplete="off" />
              @if (m.smsAppSid.set) {
                <p-button icon="pi pi-times" [text]="true" severity="danger" (onClick)="secrets.smsAppSid = ''" [ariaLabel]="'platform.settings.clear' | translate" />
              }
            </div>
          </div>
        </div>
        <p class="note"><i class="pi pi-info-circle"></i> {{ 'platform.settings.otpNote' | translate }}</p>

        <div class="save">
          <p-button [label]="'platform.settings.saveMessaging' | translate" icon="pi pi-check" [loading]="savingMsg()" (onClick)="saveMessaging()" />
        </div>

        <h3><i class="pi pi-send"></i> {{ 'platform.settings.test' | translate }}</h3>
        <div class="test">
          <input pInputText [(ngModel)]="testPhone" dir="ltr" placeholder="05XXXXXXXX" />
          <p-button [outlined]="true" icon="pi pi-whatsapp" label="WhatsApp" [loading]="testing() === 'WHATSAPP'" (onClick)="test('WHATSAPP')" />
          <p-button [outlined]="true" icon="pi pi-comment" label="SMS" [loading]="testing() === 'SMS'" (onClick)="test('SMS')" />
        </div>
        <p class="note">{{ 'platform.settings.testHint' | translate }}</p>
        @if (testResult(); as r) {
          <div class="result" [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.message }}</div>
        }
      </div>
    } @else {
      <div class="panel"><i class="pi pi-spin pi-spinner"></i></div>
    }
  `,
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
