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
import { AppDialog } from '../../../shared/dialog/dialog';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import {
  GeneralSettings,
  GoogleSettings,
  MessageChannel,
  MessagingView,
  PlanRow,
  PlatformApi,
  ProviderFieldView,
  ProviderType,
  ProviderView,
  Secret,
  TestResult,
} from '../platform.api';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

const ICONS: Record<ProviderType, string> = {
  META_WHATSAPP: 'pi pi-whatsapp',
  GUPSHUP_WHATSAPP: 'pi pi-whatsapp',
  TWILIO: 'pi pi-send',
  TAQNYAT_SMS: 'pi pi-comment',
  UNIFONIC_SMS: 'pi pi-comment',
};

/**
 * Platform settings: trial length and plan for new signups, grace period after a paid period ends, the support
 * contact companies see, Google reviews (shown or hidden for every company, with the Places API key), and the
 * message providers (Meta WhatsApp, Gupshup, Twilio, Taqnyat, Unifonic): switched
 * on and off from the list, configured and tested in a dialog.
 */
@Component({
  selector: 'app-platform-settings',
  imports: [FormsModule, TranslatePipe, AppDialog, Button, InputNumber, InputText, Password, Select, Tag, ToggleSwitch, LocalDatePipe],
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

  // ---- Google reviews ----
  protected readonly google = signal<GoogleSettings | null>(null);
  protected googleEnabled = false;
  /** Typed key: undefined = keep, '' = remove, text = replace. */
  protected googleKey: string | undefined;
  protected readonly savingGoogle = signal(false);
  protected readonly toggling = signal<ProviderType | null>(null);
  /** Bumped to rebuild the list rows (puts a switch back after a refused toggle). */
  protected readonly rev = signal(0);

  // ---- provider dialog ----
  protected dialogOpen = false;
  protected readonly editing = signal<ProviderView | null>(null);
  protected readonly saving = signal(false);
  protected priority = 10;
  /** Non-secret fields as typed. */
  protected values: Record<string, string | null> = {};
  /** Typed secrets: undefined = keep, '' = clear, text = replace. */
  protected secrets: Record<string, string | undefined> = {};
  protected templates: Record<string, string> = {};
  /** Typed since opening (tests use the saved settings). */
  protected dirty = false;

  protected testPhone = '';
  protected readonly testing = signal<MessageChannel | null>(null);
  protected readonly testResult = signal<TestResult | null>(null);

  protected readonly channels: MessageChannel[] = ['WHATSAPP', 'SMS'];
  protected readonly icons = ICONS;

  protected readonly planOptions = computed(() =>
    this.plans().filter((p) => p.active).map((p) => ({ value: p.id, label: this.lang.current() === 'ar' ? p.nameAr : p.nameEn })),
  );
  protected readonly webhookUrl = computed(() => `${location.origin}${this.msg()?.webhookPath ?? '/api/v1/webhooks/whatsapp'}`);

  constructor() {
    this.api.general().subscribe({ next: (g) => this.general.set(g), error: (e) => this.fail(e) });
    this.api.plans().subscribe({ next: (p) => this.plans.set(p.plans), error: () => {} });
    this.api.messaging().subscribe({ next: (m) => this.msg.set(m), error: (e) => this.fail(e) });
    this.api.google().subscribe({ next: (g) => this.setGoogle(g), error: (e) => this.fail(e) });
  }

  // ---- Google reviews ----

  protected googleStatus(g: GoogleSettings): { key: string; severity: Severity } {
    if (g.active) return { key: 'platform.settings.google.shown', severity: 'success' };
    if (g.enabled) return { key: 'platform.settings.google.noKey', severity: 'danger' };
    return { key: 'platform.settings.google.hidden', severity: 'secondary' };
  }

  protected googlePlaceholder(g: GoogleSettings): string {
    if (g.key.set) return this.translate.instant('platform.settings.savedKeep', { h: g.key.hint ?? '' });
    if (g.envKey) return this.translate.instant('platform.settings.google.envKeyUsed');
    return this.translate.instant('platform.settings.notSet');
  }

  protected saveGoogle(): void {
    const key = this.googleKey === undefined ? null : this.googleKey.trim();
    this.savingGoogle.set(true);
    this.api.saveGoogle(this.googleEnabled, key).subscribe({
      next: (g) => {
        this.setGoogle(g);
        this.savingGoogle.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (e) => {
        this.savingGoogle.set(false);
        this.fail(e);
      },
    });
  }

  private setGoogle(g: GoogleSettings): void {
    this.google.set(g);
    this.googleEnabled = g.enabled;
    this.googleKey = undefined;
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

  // ---- list ----

  protected name(type: ProviderType): string {
    return this.msg()?.providers.find((p) => p.type === type)?.name ?? type;
  }

  protected status(p: ProviderView): { key: string; severity: Severity } {
    if (p.enabled && p.activeChannels.length) return { key: 'platform.settings.status.sending', severity: 'success' };
    if (p.enabled) return { key: 'platform.settings.status.missing', severity: 'danger' };
    if (p.ready) return { key: 'platform.settings.status.off', severity: 'secondary' };
    return { key: 'platform.settings.status.notConfigured', severity: 'warn' };
  }

  /** Switch on/off from the list; the server refuses to switch on a provider that is not configured. */
  protected toggle(p: ProviderView, enabled: boolean): void {
    this.toggling.set(p.type);
    this.api.setProviderEnabled(p.type, enabled).subscribe({
      next: (m) => {
        this.msg.set(m);
        this.toggling.set(null);
        this.messages.add({
          severity: 'success',
          summary: this.translate.instant(enabled ? 'platform.settings.turnedOn' : 'platform.settings.turnedOff', { name: p.name }),
        });
      },
      error: (e) => {
        this.toggling.set(null);
        this.rev.update((r) => r + 1); // put the switch back
        this.fail(e);
      },
    });
  }

  // ---- dialog ----

  protected configure(p: ProviderView): void {
    this.editing.set(p);
    this.priority = p.priority;
    this.values = {};
    for (const f of p.fields) {
      if (!f.secret) this.values[f.key] = f.value;
    }
    this.secrets = {};
    this.templates = { ...p.templates };
    this.dirty = false;
    this.testResult.set(null);
    this.dialogOpen = true;
  }

  protected placeholder(f: ProviderFieldView): string {
    const s: Secret | null = f.saved;
    if (s?.set) return this.translate.instant('platform.settings.savedKeep', { h: s.hint ?? '' });
    return this.translate.instant('platform.settings.notSet');
  }

  protected touch(): void {
    this.dirty = true;
  }

  protected clearSecret(key: string): void {
    this.secrets[key] = '';
    this.dirty = true;
  }

  protected save(): void {
    const p = this.editing();
    if (!p) return;
    const values: Record<string, string | null> = { ...this.values };
    for (const f of p.fields) {
      if (f.secret) values[f.key] = this.secrets[f.key] ?? null;
    }
    this.saving.set(true);
    this.api.saveProvider(p.type, { enabled: p.enabled, priority: this.priority, values, templates: this.templates }).subscribe({
      next: (m) => {
        this.msg.set(m);
        this.saving.set(false);
        const fresh = m.providers.find((x) => x.type === p.type);
        if (fresh) this.configure(fresh); // stays open so it can be tested
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (e) => {
        this.saving.set(false);
        this.fail(e);
      },
    });
  }

  protected test(channel: MessageChannel): void {
    const p = this.editing();
    if (!p) return;
    this.testing.set(channel);
    this.testResult.set(null);
    this.api.testProvider(p.type, channel, this.testPhone).subscribe({
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
