import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantService } from '../../core/tenant.service';
import { PhonePipe, SAUDI_MOBILE_PATTERN, SarPipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { LockedFeature } from '../../shared/locked-feature';
import { UpgradeService } from '../../core/upgrade.service';
import { NotificationSettingsPanel } from './notification-settings.panel';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule, Textarea, TranslatePipe, Button, Checkbox, InputText, Tag, LocalDatePipe, SarPipe, NotificationSettingsPanel, LockedFeature],
  styles: `
    .layout { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; align-items: start; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    h2 { margin: 0 0 1rem; font-size: 1.05rem; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: .6rem 1rem; margin: 0; }
    dt { color: var(--fo-muted); }
    dd { margin: 0; }
    .check { display: inline-flex; gap: .5rem; align-items: center; cursor: pointer; }
    .logo-row { display: flex; gap: 1rem; align-items: center; }
    .logo-box { width: 120px; height: 72px; border: 1px dashed var(--fo-border); border-radius: 10px; display: grid; place-items: center; background: #fff; }
    .logo-box img { max-width: 110px; max-height: 64px; object-fit: contain; }
    .logo-box i { font-size: 1.6rem; }
    .link-row { display: flex; align-items: center; gap: .25rem; margin: .75rem 0; flex-wrap: wrap; }
    .link-row code { background: var(--fo-bg); padding: .4rem .6rem; border-radius: 8px; font-size: .85rem; word-break: break-all; }
    .logo-actions { display: grid; gap: .4rem; justify-items: start; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'settings.title' | translate }}</h1>
        <p>{{ 'settings.subtitle' | translate }}</p>
      </div>
    </div>

    <div class="layout">
      <div class="panel">
        <h2>{{ 'settings.company' | translate }}</h2>
        <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
          <div class="field full">
            <label for="s-name">{{ 'settings.companyName' | translate }}</label>
            <input pInputText id="s-name" formControlName="name" />
          </div>
          <div class="field">
            <label for="s-phone">{{ 'settings.phone' | translate }}</label>
            <input pInputText id="s-phone" formControlName="phone" dir="ltr" placeholder="05XXXXXXXX" />
          </div>
          <div class="field">
            <label for="s-vat">{{ 'settings.vatNumber' | translate }}</label>
            <input pInputText id="s-vat" formControlName="vatNumber" dir="ltr" placeholder="3XXXXXXXXXXXXX3" />
          </div>
          <div class="field">
            <label for="s-cr">{{ 'settings.cr' | translate }}</label>
            <input pInputText id="s-cr" formControlName="commercialRegistration" dir="ltr" placeholder="10XXXXXXXX" maxlength="10" />
          </div>
          <div class="field full">
            <label for="s-address">{{ 'settings.address' | translate }}</label>
            <input pInputText id="s-address" formControlName="address" maxlength="300" />
            <small class="hint">{{ 'settings.addressHint' | translate }}</small>
          </div>
          <div class="field full">
            <label class="check"><p-checkbox formControlName="pricesIncludeVat" [binary]="true" /> {{ 'settings.pricesIncludeVat' | translate }}</label>
            <small class="hint">{{ 'settings.pricesIncludeVatHint' | translate }}</small>
          </div>
          <div class="field full" [hidden]="tenants.locked('quotes_invoices')">
            <label class="check"><p-checkbox formControlName="autoInvoice" [binary]="true" /> {{ 'settings.autoInvoice' | translate }}</label>
            <small class="hint">{{ 'settings.autoInvoiceHint' | translate }}</small>
          </div>
          <div class="dialog-actions full">
            <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid || form.pristine" />
          </div>
        </form>
      </div>

      @if (tenants.tenant(); as t) {
        <div>
        <div class="panel">
          <h2>{{ 'settings.logo' | translate }}</h2>
          @if (tenants.locked('branding')) {
            <app-locked-feature feature="branding" />
          } @else {
          <div class="logo-row">
            <div class="logo-box">
              @if (t.logoUrl) { <img [src]="t.logoUrl" alt="" /> } @else { <i class="pi pi-image muted"></i> }
            </div>
            <div class="logo-actions">
              <input #logoInput type="file" accept="image/png,image/jpeg" hidden (change)="onLogo($any($event.target))" />
              <p-button icon="pi pi-upload" [label]="'settings.uploadLogo' | translate" size="small" [loading]="uploading()" (onClick)="logoInput.click()" />
              @if (t.logoUrl) {
                <p-button icon="pi pi-trash" [label]="'common.delete' | translate" size="small" severity="danger" [text]="true" (onClick)="removeLogo()" />
              }
              <small class="hint">{{ 'settings.logoHint' | translate }}</small>
            </div>
          </div>
          }
        </div>
        <div class="panel" style="margin-top: 1rem">
          <h2>{{ 'settings.bookingPage' | translate }}</h2>
          @if (tenants.locked('booking_page')) {
            <app-locked-feature feature="booking_page" />
          } @else {
          <label class="check"><p-checkbox [(ngModel)]="pageEnabled" [binary]="true" /> {{ 'settings.bookingPageEnabled' | translate }}</label>
          <div class="field" style="margin-top: .75rem">
            <label for="s-note">{{ 'settings.bookingPageNote' | translate }}</label>
            <textarea pTextarea id="s-note" [(ngModel)]="pageNote" rows="2" maxlength="500" [placeholder]="'settings.bookingPageNotePlaceholder' | translate"></textarea>
          </div>
          <div class="link-row">
            <code class="ltr">{{ tenants.bookingUrl() }}</code>
            <p-button icon="pi pi-copy" [text]="true" size="small" (onClick)="copyLink()" [ariaLabel]="'common.copy' | translate" />
            <a [href]="tenants.bookingUrl()" target="_blank" rel="noopener"><p-button icon="pi pi-external-link" [text]="true" size="small" /></a>
          </div>
          <p-button [label]="'common.save' | translate" size="small" [loading]="pageSaving()" (onClick)="savePage()" />
          }
        </div>
        <div class="panel" style="margin-top: 1rem">
          <h2>{{ 'settings.subscription' | translate }}</h2>
          <dl>
            <dt>{{ 'settings.plan' | translate }}</dt>
            <dd>{{ lang.current() === 'ar' ? t.plan.nameAr : t.plan.nameEn }} · <span class="ltr">{{ t.plan.priceMonthlyHalalas | sar }}</span> / {{ 'settings.month' | translate }}</dd>
            <dt>{{ 'common.status' | translate }}</dt>
            <dd><p-tag [value]="'settings.status.' + t.status | translate" [severity]="t.status === 'ACTIVE' ? 'success' : 'warn'" /></dd>
            @if (t.trialEndsAt) {
              <dt>{{ 'settings.trialEnds' | translate }}</dt>
              <dd>{{ t.trialEndsAt | ldate: 'mediumDate' }}</dd>
            }
            <dt>{{ 'settings.maxTechnicians' | translate }}</dt>
            <dd>{{ t.plan.maxTechnicians }}</dd>
            <dt>{{ 'settings.bookingSlug' | translate }}</dt>
            <dd class="ltr">{{ t.slug }}</dd>
          </dl>
          <p-button icon="pi pi-bolt" [label]="'upgrade.changePlan' | translate" size="small" [outlined]="true" (onClick)="upgrade.prompt()" />
        </div>
        </div>
      }
    </div>

    <div class="panel" style="margin-top: 1rem; max-width: 720px">
      <app-notification-settings />
    </div>
  `,
})
export class SettingsPage implements OnInit {
  protected readonly tenants = inject(TenantService);
  protected readonly upgrade = inject(UpgradeService);
  protected readonly lang = inject(LanguageService);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly phonePipe = new PhonePipe();

  protected readonly saving = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    phone: ['', [Validators.pattern(SAUDI_MOBILE_PATTERN)]],
    vatNumber: ['', [Validators.pattern(/^3\d{13}3$/)]],
    commercialRegistration: ['', [Validators.pattern(/^\d{10}$/)]],
    address: ['', [Validators.maxLength(300)]],
    pricesIncludeVat: [false],
    autoInvoice: [true],
  });
  protected readonly uploading = signal(false);
  protected readonly pageSaving = signal(false);
  protected pageEnabled = true;
  protected pageNote = '';
  private pageLoaded = false;

  constructor() {
    effect(() => {
      const t = this.tenants.tenant();
      if (t && !this.pageLoaded) {
        this.pageLoaded = true;
        this.pageEnabled = t.bookingPageEnabled;
        this.pageNote = t.bookingPageNote ?? '';
      }
      if (t && this.form.pristine) {
        this.form.reset({
          name: t.name,
          phone: t.phone ? this.phonePipe.transform(t.phone, false).replace(/\s/g, '') : '',
          vatNumber: t.vatNumber ?? '',
          commercialRegistration: t.commercialRegistration ?? '',
          address: t.address ?? '',
          pricesIncludeVat: t.pricesIncludeVat,
          autoInvoice: t.autoInvoice ?? true,
        });
      }
    });
  }

  ngOnInit(): void {
    this.tenants.load().subscribe({ error: () => {} });
  }

  save(): void {
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.tenants
      .update({
        name: v.name,
        phone: v.phone || null,
        vatNumber: v.vatNumber || null,
        commercialRegistration: v.commercialRegistration || null,
        address: v.address.trim() || null,
        pricesIncludeVat: v.pricesIncludeVat,
        autoInvoice: v.autoInvoice,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        },
        error: (err) => {
          this.saving.set(false);
          this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
        },
      });
  }

  onLogo(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.messages.add({ severity: 'error', summary: this.translate.instant('errors.file_too_large') });
      return;
    }
    this.uploading.set(true);
    this.tenants.uploadLogo(file).subscribe({
      next: () => this.uploading.set(false),
      error: (err) => {
        this.uploading.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  removeLogo(): void {
    this.tenants.removeLogo().subscribe({
      error: (err) => this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) }),
    });
  }

  savePage(): void {
    this.pageSaving.set(true);
    this.tenants.updateBookingPage(this.pageEnabled, this.pageNote.trim() || null).subscribe({
      next: () => {
        this.pageSaving.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (err) => {
        this.pageSaving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  copyLink(): void {
    void navigator.clipboard?.writeText(this.tenants.bookingUrl()).then(() =>
      this.messages.add({ severity: 'success', summary: this.translate.instant('common.copied') }),
    );
  }
}
