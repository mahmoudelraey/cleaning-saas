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
import { portalBase } from '../../core/portal';
import { GoogleCandidate, PublicPage } from '../../core/api.types';
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
    .slug-edit { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .slug-edit .prefix { color: var(--fo-muted, #6b7280); font-size: .9rem; }
    .slug-edit input { flex: 1 1 10rem; min-width: 8rem; }
    .hint.warn { display: block; color: var(--p-orange-600, #c2410c); margin-top: .25rem; }
    .g-search { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .75rem; }
    .g-search input { flex: 1 1 14rem; }
    .g-results { list-style: none; padding: 0; margin: .75rem 0 0; display: flex; flex-direction: column; gap: .5rem; }
    .g-results li, .g-connected { display: flex; align-items: center; gap: .75rem; padding: .6rem .75rem; border: 1px solid var(--fo-border); border-radius: 10px; }
    .g-connected { margin-top: .75rem; }
    .g-connected > i { color: var(--p-primary-600); }
    .pp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem 1rem; margin-top: .75rem; }
    .pp-grid .wide { grid-column: 1 / -1; }
    .online { display: flex; align-items: flex-start; gap: .6rem; margin: .75rem 0 .25rem; }
    .online small { display: block; }
    .with-action { display: flex; gap: .25rem; align-items: center; }
    .with-action input { flex: 1; min-width: 0; }
    .pp-grid label i { font-size: .85rem; }
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
      <div>
      <div class="panel">
        <h2>{{ 'settings.company' | translate }}</h2>
        <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
          <div class="field full">
            <label for="s-name">{{ 'settings.companyName' | translate }}</label>
            <input pInputText id="s-name" formControlName="name" />
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

      <!-- Customer messages sit right under the company details, filling that column. -->
      <div class="panel" style="margin-top: 1rem">
        <app-notification-settings />
      </div>
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
          <h2>{{ 'settings.portal' | translate }}</h2>
          <p class="hint">{{ 'settings.portalHint' | translate }}</p>
          @if (tenants.locked('booking_page')) {
            <app-locked-feature feature="booking_page" />
          } @else {
            <label class="check online">
              <p-checkbox [(ngModel)]="pageEnabled" [binary]="true" (onChange)="saveOnlineBooking()" [disabled]="pageSaving()" />
              <span>
                {{ 'settings.onlineBooking' | translate }}
                <small class="hint">{{ 'settings.onlineBookingHint' | translate }}</small>
              </span>
            </label>
          }
          <div class="field" style="margin-top: .75rem">
            <label for="s-slug">{{ 'settings.slug' | translate }}</label>
            <div class="slug-edit ltr">
              <span class="prefix">{{ portalPrefix }}/</span>
              <input pInputText id="s-slug" [(ngModel)]="slug" maxlength="40" autocapitalize="off" autocomplete="off" spellcheck="false"
                     (ngModelChange)="slug = cleanSlug($event)" />
              <p-button [label]="'common.save' | translate" size="small" [disabled]="!slugChanged()" [loading]="slugSaving()" (onClick)="saveSlug()" />
            </div>
            <small class="hint">{{ 'settings.slugHint' | translate }}</small>
            @if (slugChanged()) {
              <small class="hint warn">{{ 'settings.slugChangeWarning' | translate }}</small>
            }
          </div>
          <div class="link-row">
            <code class="ltr">{{ tenants.portalUrl() }}</code>
            <p-button icon="pi pi-copy" [text]="true" size="small" (onClick)="copyLink(tenants.portalUrl())" [ariaLabel]="'common.copy' | translate" />
            <a [href]="tenants.portalUrl()" target="_blank" rel="noopener"><p-button icon="pi pi-external-link" [text]="true" size="small" /></a>
          </div>
        </div>
        <div class="panel" style="margin-top: 1rem">
          <h2>{{ 'settings.contact.title' | translate }}</h2>
          <p class="hint">{{ 'settings.contact.hint' | translate }}</p>
          <div class="pp-grid">
            <div class="field">
              <label for="ct-phone"><i class="pi pi-phone"></i> {{ 'settings.contact.phone' | translate }}</label>
              <input pInputText id="ct-phone" class="ltr" [(ngModel)]="contact.phone" inputmode="tel" maxlength="15" placeholder="05XXXXXXXX" />
            </div>
            <div class="field">
              <label for="ct-wa"><i class="pi pi-whatsapp"></i> {{ 'settings.contact.whatsapp' | translate }}</label>
              <div class="with-action">
                <input pInputText id="ct-wa" class="ltr" [(ngModel)]="contact.whatsapp" inputmode="tel" maxlength="15" placeholder="05XXXXXXXX" />
                @if (contact.phone && !contact.whatsapp) {
                  <p-button [label]="'settings.contact.sameAsPhone' | translate" size="small" [text]="true" (onClick)="contact.whatsapp = contact.phone" />
                }
              </div>
            </div>
            <div class="field">
              <label for="ct-fb"><i class="pi pi-facebook"></i> Facebook</label>
              <input pInputText id="ct-fb" class="ltr" [(ngModel)]="contact.facebook" maxlength="300" [placeholder]="'settings.contact.fbPlaceholder' | translate" />
            </div>
            <div class="field">
              <label for="ct-ig"><i class="pi pi-instagram"></i> Instagram</label>
              <input pInputText id="ct-ig" class="ltr" [(ngModel)]="contact.instagram" maxlength="200" [placeholder]="'settings.pp.handlePlaceholder' | translate" />
            </div>
            <div class="field">
              <label for="ct-tt"><i class="pi pi-tiktok"></i> TikTok</label>
              <input pInputText id="ct-tt" class="ltr" [(ngModel)]="contact.tiktok" maxlength="200" [placeholder]="'settings.pp.handlePlaceholder' | translate" />
            </div>
            <div class="field">
              <label for="ct-sc">Snapchat</label>
              <input pInputText id="ct-sc" class="ltr" [(ngModel)]="contact.snapchat" maxlength="200" [placeholder]="'settings.pp.handlePlaceholder' | translate" />
            </div>
            <div class="field">
              <label for="ct-x">X</label>
              <input pInputText id="ct-x" class="ltr" [(ngModel)]="contact.x" maxlength="200" [placeholder]="'settings.pp.handlePlaceholder' | translate" />
            </div>
          </div>
          <small class="hint">{{ 'settings.pp.handleHint' | translate }}</small>
          <div class="link-row">
            <p-button [label]="'common.save' | translate" size="small" [loading]="contactSaving()" (onClick)="saveContact()" />
            <a [href]="tenants.portalUrl() + '/contact'" target="_blank" rel="noopener"><p-button icon="pi pi-external-link" [label]="'settings.contact.preview' | translate" [text]="true" size="small" /></a>
          </div>
        </div>
        <div class="panel" style="margin-top: 1rem">
          <h2>{{ 'settings.publicPage' | translate }}</h2>
          <p class="hint">{{ 'settings.publicPageHint' | translate }}</p>
          <div class="pp-grid">
            <div class="field wide">
              <label for="pp-headline">{{ 'settings.pp.headline' | translate }}</label>
              <input pInputText id="pp-headline" [(ngModel)]="pp.headline" maxlength="120" [placeholder]="'settings.pp.headlinePlaceholder' | translate" />
            </div>
            <div class="field wide">
              <label for="pp-about">{{ 'settings.pp.about' | translate }}</label>
              <textarea pTextarea id="pp-about" [(ngModel)]="pp.about" rows="4" maxlength="2000" [placeholder]="'settings.pp.aboutPlaceholder' | translate"></textarea>
              <small class="hint">{{ (pp.about || '').length }}/2000</small>
            </div>
            <div class="field">
              <label for="pp-year">{{ 'settings.pp.foundedYear' | translate }}</label>
              <input pInputText id="pp-year" class="ltr" type="number" [(ngModel)]="pp.foundedYear" min="1950" [max]="thisYear" placeholder="2018" />
            </div>
            <div class="field">
              <label for="pp-team">{{ 'settings.pp.teamSize' | translate }}</label>
              <input pInputText id="pp-team" class="ltr" type="number" [(ngModel)]="pp.teamSize" min="1" max="10000" placeholder="12" />
            </div>
            <div class="field wide">
              <label for="pp-promises">{{ 'settings.pp.promises' | translate }}</label>
              <textarea pTextarea id="pp-promises" [(ngModel)]="pp.promises" rows="4" maxlength="1000" [placeholder]="'settings.pp.promisesPlaceholder' | translate"></textarea>
              <small class="hint">{{ 'settings.pp.promisesHint' | translate }}</small>
            </div>
            <div class="field">
              <label for="pp-areas">{{ 'settings.pp.areas' | translate }}</label>
              <input pInputText id="pp-areas" [(ngModel)]="pp.areas" maxlength="300" [placeholder]="'settings.pp.areasPlaceholder' | translate" />
              <small class="hint">{{ 'settings.pp.areasHint' | translate }}</small>
            </div>
            <div class="field">
              <label for="pp-hours">{{ 'settings.pp.hours' | translate }}</label>
              <input pInputText id="pp-hours" [(ngModel)]="pp.hours" maxlength="150" [placeholder]="'settings.pp.hoursPlaceholder' | translate" />
            </div>
          </div>
          <div class="link-row">
            <p-button [label]="'common.save' | translate" size="small" [loading]="ppSaving()" (onClick)="savePublicPage()" />
            <a [href]="tenants.portalUrl()" target="_blank" rel="noopener"><p-button icon="pi pi-external-link" [label]="'settings.pp.preview' | translate" [text]="true" size="small" /></a>
          </div>
        </div>
        <div class="panel" style="margin-top: 1rem">
          <h2>{{ 'settings.google.title' | translate }}</h2>
          <p class="hint">{{ 'settings.google.hint' | translate }}</p>
          @if (!t.google?.available) {
            <p class="hint warn">{{ 'settings.google.notAvailable' | translate }}</p>
          } @else if (t.google?.placeId) {
            <div class="g-connected">
              <i class="pi pi-map-marker"></i>
              <span style="flex:1"><strong>{{ t.google?.name }}</strong><br /><small class="hint">{{ 'settings.google.connected' | translate }}</small></span>
              <a [href]="tenants.portalUrl() + '#reviews'" target="_blank" rel="noopener"><p-button icon="pi pi-external-link" [text]="true" size="small" [ariaLabel]="'settings.pp.preview' | translate" /></a>
              <p-button [label]="'settings.google.disconnect' | translate" severity="secondary" [outlined]="true" size="small" [loading]="gSaving()" (onClick)="connectGoogle(null)" />
            </div>
          } @else {
            <form class="g-search" (ngSubmit)="searchGoogle()">
              <input pInputText name="gq" [(ngModel)]="gQuery" maxlength="200" [placeholder]="'settings.google.placeholder' | translate" [attr.aria-label]="'settings.google.search' | translate" />
              <p-button type="submit" icon="pi pi-search" [label]="'settings.google.search' | translate" size="small" [loading]="gSearching()" [disabled]="!gQuery.trim()" />
            </form>
            @if (gResults(); as list) {
              @if (list.length) {
                <ul class="g-results">
                  @for (c of list; track c.placeId) {
                    <li>
                      <span style="flex:1; min-width:0"><strong>{{ c.name }}</strong><br /><small class="hint">{{ c.address }}</small></span>
                      <p-button [label]="'settings.google.thisIsUs' | translate" size="small" [loading]="gSaving()" (onClick)="connectGoogle(c)" />
                    </li>
                  }
                </ul>
              } @else {
                <p class="hint">{{ 'settings.google.noResults' | translate }}</p>
              }
            }
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
  protected readonly portalPrefix = portalBase();
  protected slug = '';
  protected readonly slugSaving = signal(false);
  protected pp: PublicPage = {};
  protected readonly thisYear = new Date().getFullYear();
  protected gQuery = '';
  protected readonly gResults = signal<GoogleCandidate[] | null>(null);
  protected readonly gSearching = signal(false);
  protected readonly gSaving = signal(false);
  protected readonly ppSaving = signal(false);
  protected contact = { phone: '', whatsapp: '', facebook: '', instagram: '', tiktok: '', snapchat: '', x: '' };
  protected readonly contactSaving = signal(false);

  constructor() {
    effect(() => {
      const t = this.tenants.tenant();
      if (t && !this.pageLoaded) {
        this.pageLoaded = true;
        this.pageEnabled = t.bookingPageEnabled;
        this.pageNote = t.bookingPageNote ?? '';
        this.slug = t.slug;
        this.gQuery = t.name;
        const p = t.publicPage ?? {};
        this.pp = { ...p };
        this.contact = {
          phone: this.local(t.phone),
          whatsapp: this.local(p.whatsapp),
          facebook: p.facebook ?? '',
          instagram: p.instagram ?? '',
          tiktok: p.tiktok ?? '',
          snapchat: p.snapchat ?? '',
          x: p.x ?? '',
        };
      }
      if (t && this.form.pristine) {
        this.form.reset({
          name: t.name,
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

  /** Turns online booking in the customer portal on or off (saved right away; the old page note is kept). */
  saveOnlineBooking(): void {
    this.pageSaving.set(true);
    this.tenants.updateBookingPage(this.pageEnabled, this.pageNote.trim() || null).subscribe({
      next: () => {
        this.pageSaving.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant(this.pageEnabled ? 'settings.onlineBookingOn' : 'settings.onlineBookingOff') });
      },
      error: (err) => {
        this.pageSaving.set(false);
        this.pageEnabled = !this.pageEnabled;
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  protected cleanSlug(v: string): string {
    return (v ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  protected slugChanged(): boolean {
    const current = this.tenants.tenant()?.slug;
    return !!this.slug && !!current && this.slug !== current;
  }

  saveSlug(): void {
    this.slugSaving.set(true);
    this.tenants.changeSlug(this.slug).subscribe({
      next: (t) => {
        this.slugSaving.set(false);
        this.slug = t.slug;
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (err) => {
        this.slugSaving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  savePublicPage(): void {
    this.ppSaving.set(true);
    const blank = (v?: string) => (v && v.trim() ? v.trim() : null);
    const p = this.pp;
    this.tenants
      .updatePublicPage({
        headline: blank(p.headline) ?? undefined,
        about: blank(p.about) ?? undefined,
        areas: blank(p.areas) ?? undefined,
        hours: blank(p.hours) ?? undefined,
        foundedYear: p.foundedYear || undefined,
        teamSize: p.teamSize || undefined,
        promises: blank(p.promises) ?? undefined,
      })
      .subscribe({
        next: () => {
          this.ppSaving.set(false);
          this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        },
        error: (err) => {
          this.ppSaving.set(false);
          this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
        },
      });
  }

  saveContact(): void {
    const c = this.contact;
    for (const [field, value] of [['phone', c.phone], ['whatsapp', c.whatsapp]] as const) {
      const v = value.replace(/[\s-]/g, '');
      if (v && !new RegExp(SAUDI_MOBILE_PATTERN).test(v)) {
        this.messages.add({ severity: 'error', summary: this.translate.instant('settings.contact.badMobile.' + field) });
        return;
      }
    }
    const blank = (v: string) => (v.trim() ? v.trim() : null);
    this.contactSaving.set(true);
    this.tenants
      .updateContact({
        phone: blank(c.phone.replace(/[\s-]/g, '')),
        whatsapp: blank(c.whatsapp.replace(/[\s-]/g, '')),
        facebook: blank(c.facebook),
        instagram: blank(c.instagram),
        tiktok: blank(c.tiktok),
        snapchat: blank(c.snapchat),
        x: blank(c.x),
      })
      .subscribe({
        next: (t) => {
          this.contactSaving.set(false);
          // Show what was stored (links and @ are reduced to the account name).
          const p = t.publicPage ?? {};
          this.contact = {
            phone: this.local(t.phone),
            whatsapp: this.local(p.whatsapp),
            facebook: p.facebook ?? '',
            instagram: p.instagram ?? '',
            tiktok: p.tiktok ?? '',
            snapchat: p.snapchat ?? '',
            x: p.x ?? '',
          };
          this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        },
        error: (err) => {
          this.contactSaving.set(false);
          this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
        },
      });
  }

  /** +966551234567 → 0551234567 for an input. */
  private local(e164?: string | null): string {
    return e164 ? this.phonePipe.transform(e164, false).replace(/\s/g, '') : '';
  }

  searchGoogle(): void {
    const q = this.gQuery.trim();
    if (!q) return;
    this.gSearching.set(true);
    this.tenants.searchGoogle(q, this.lang.current()).subscribe({
      next: (r) => {
        this.gSearching.set(false);
        this.gResults.set(r);
      },
      error: (err) => {
        this.gSearching.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  connectGoogle(c: GoogleCandidate | null): void {
    this.gSaving.set(true);
    this.tenants.connectGoogle(c?.placeId ?? null, c?.name ?? null).subscribe({
      next: () => {
        this.gSaving.set(false);
        this.gResults.set(null);
        this.messages.add({ severity: 'success', summary: this.translate.instant(c ? 'settings.google.done' : 'settings.google.removed') });
      },
      error: (err) => {
        this.gSaving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  copyLink(url: string): void {
    void navigator.clipboard?.writeText(url).then(() =>
      this.messages.add({ severity: 'success', summary: this.translate.instant('common.copied') }),
    );
  }
}
