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
import { PublicPage } from '../../core/api.types';
import { PhonePipe, SAUDI_MOBILE_PATTERN, SarPipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { LockedFeature } from '../../shared/locked-feature/locked-feature';
import { UpgradeService } from '../../core/upgrade.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule, Textarea, TranslatePipe, Button, Checkbox, InputText, Tag, LocalDatePipe, SarPipe, LockedFeature],
  styleUrl: './settings.page.scss',
  templateUrl: './settings.page.html',
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
    nameEn: ['', [Validators.maxLength(150)]],
    vatNumber: ['', [Validators.pattern(/^3\d{13}3$/)]],
    commercialRegistration: ['', [Validators.pattern(/^\d{10}$/)]],
    address: ['', [Validators.maxLength(300)]],
    addressEn: ['', [Validators.maxLength(300)]],
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
          nameEn: t.nameEn ?? '',
          vatNumber: t.vatNumber ?? '',
          commercialRegistration: t.commercialRegistration ?? '',
          address: t.address ?? '',
          addressEn: t.addressEn ?? '',
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
        nameEn: v.nameEn.trim(),
        vatNumber: v.vatNumber || null,
        commercialRegistration: v.commercialRegistration || null,
        address: v.address.trim() || null,
        addressEn: v.addressEn.trim(),
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
        headlineEn: blank(p.headlineEn) ?? undefined,
        aboutEn: blank(p.aboutEn) ?? undefined,
        areas: blank(p.areas) ?? undefined,
        hours: blank(p.hours) ?? undefined,
        foundedYear: p.foundedYear || undefined,
        teamSize: p.teamSize || undefined,
        promises: blank(p.promises) ?? undefined,
        promisesEn: blank(p.promisesEn) ?? undefined,
        areasEn: blank(p.areasEn) ?? undefined,
        hoursEn: blank(p.hoursEn) ?? undefined,
        heroTitle: blank(p.heroTitle) ?? undefined,
        heroTitleEn: blank(p.heroTitleEn) ?? undefined,
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

  copyLink(url: string): void {
    void navigator.clipboard?.writeText(url).then(() =>
      this.messages.add({ severity: 'success', summary: this.translate.instant('common.copied') }),
    );
  }
}
