import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Address, AddressForm, Profile } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { PhonePipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast';

@Component({
  selector: 'pt-profile',
  imports: [FormsModule, NgTemplateOutlet, TranslatePipe, PhonePipe],
  styleUrl: './profile.page.scss',
  templateUrl: './profile.page.html',
})
export class ProfilePage implements OnInit {
  private readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);

  protected readonly profile = signal<Profile | null>(null);
  protected readonly busy = signal(false);
  protected name = '';
  protected email = '';

  ngOnInit(): void {
    this.api.me(this.store.slug()).subscribe({
      next: (p) => {
        this.profile.set(p);
        this.name = p.name;
        this.email = p.email ?? '';
      },
    });
  }

  save(): void {
    this.busy.set(true);
    this.api.updateMe(this.store.slug(), this.name.trim(), this.email.trim() || null).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.profile.set(p);
        if (p.token && p.tokenExpiresAt) {
          this.sessions.refreshToken(this.store.slug(), p.token, p.tokenExpiresAt, p.name);
        }
        this.toasts.show(this.translate.instant('profile.saved'));
      },
      error: (e) => {
        this.busy.set(false);
        this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }

  // --- addresses: add one, or edit one that exists (one form open at a time) ---
  /** null = no form open; 'new' = adding; otherwise the id of the address being edited. */
  protected readonly editing = signal<string | null>(null);
  protected readonly savingAddress = signal(false);
  protected form: AddressForm = this.emptyForm();

  protected startAdd(): void {
    this.form = this.emptyForm();
    this.editing.set('new');
  }

  protected startEdit(a: Address): void {
    this.form = { label: a.label ?? '', city: a.city ?? '', district: a.district ?? '', details: a.details ?? '', mapUrl: a.mapUrl ?? '' };
    this.editing.set(a.id);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected formFilled(): boolean {
    const f = this.form;
    return [f.city, f.district, f.details, f.mapUrl].some((v) => !!v?.trim());
  }

  saveAddress(): void {
    const id = this.editing();
    if (id === null || !this.formFilled()) return;
    const clean = (v: string | null) => v?.trim() || null;
    const f = this.form;
    this.savingAddress.set(true);
    this.api
      .saveAddress(this.store.slug(), id === 'new' ? null : id, {
        label: clean(f.label),
        city: clean(f.city),
        district: clean(f.district),
        details: clean(f.details),
        mapUrl: clean(f.mapUrl),
      })
      .subscribe({
        next: (p) => {
          this.savingAddress.set(false);
          this.profile.set(p);
          this.editing.set(null);
          this.toasts.show(this.translate.instant('profile.addressSaved'));
        },
        error: (e) => {
          this.savingAddress.set(false);
          this.toasts.show(errorMessage(e, this.translate), 'error');
        },
      });
  }

  private emptyForm(): AddressForm {
    return { label: '', city: '', district: '', details: '', mapUrl: '' };
  }

  protected line(a: Address): string {
    return [a.district, a.city, a.details].filter(Boolean).join('، ');
  }

  signOut(): void {
    this.sessions.clear(this.store.slug());
    void this.router.navigate(['/', this.store.slug(), 'login']);
  }
}
