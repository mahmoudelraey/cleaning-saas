import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Address, Profile } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { PhonePipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast';

@Component({
  selector: 'pt-profile',
  imports: [FormsModule, TranslatePipe, PhonePipe],
  styles: `
    .who { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
    .avatar { width: 56px; height: 56px; border-radius: 50%; background: var(--foam); color: var(--tide-deep);
              display: grid; place-items: center; font-weight: 700; font-size: 1.3rem; }
    .who h1 { font-size: 1.3rem; }
    .row i { color: var(--tide); }
    .row .txt { flex: 1; min-width: 0; }
    .row .txt small { display: block; color: var(--ink-2); }
    .out { margin-top: 26px; }
  `,
  template: `
    <div class="page">
      @if (profile(); as p) {
        <div class="who">
          <span class="avatar">{{ p.name.trim().charAt(0) }}</span>
          <div><h1>{{ p.name }}</h1><span class="muted ltr">{{ p.phone | phone }}</span></div>
        </div>

        <h2 class="section-title">{{ 'profile.details' | translate }}</h2>
        <form class="sheet" (ngSubmit)="save()">
          <div class="field"><label for="n">{{ 'login.name' | translate }}</label><input id="n" name="n" class="input" [(ngModel)]="name" maxlength="150" required /></div>
          <div class="field"><label for="e">{{ 'profile.email' | translate }}</label><input id="e" name="e" type="email" class="input ltr" style="display:block" [(ngModel)]="email" maxlength="200" /><small>{{ 'profile.emailHint' | translate }}</small></div>
          <button class="btn btn-primary" [disabled]="busy() || !name.trim()">{{ 'profile.save' | translate }}</button>
        </form>

        <h2 class="section-title">{{ 'profile.addresses' | translate }}</h2>
        @if (p.addresses.length) {
          <div class="rows">
            @for (a of p.addresses; track a.id) {
              <div class="row">
                <i class="pi pi-map-marker"></i>
                <span class="txt">{{ a.label || a.district || a.city }}<small>{{ line(a) }}</small></span>
                @if (a.mapUrl) { <a [href]="a.mapUrl" target="_blank" rel="noopener" [attr.aria-label]="'detail.map' | translate"><i class="pi pi-external-link"></i></a> }
              </div>
            }
          </div>
          <p class="muted" style="font-size:.85rem">{{ 'profile.addressHint' | translate }}</p>
        } @else {
          <div class="sheet empty" style="padding:24px"><p style="margin:0">{{ 'profile.noAddresses' | translate }}</p></div>
        }

        <div class="out">
          <button type="button" class="btn btn-quiet btn-block" (click)="signOut()"><i class="pi pi-sign-out"></i>{{ 'profile.signOut' | translate }}</button>
        </div>
      } @else {
        <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
      }
    </div>
  `,
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

  protected line(a: Address): string {
    return [a.district, a.city, a.details].filter(Boolean).join('، ');
  }

  signOut(): void {
    this.sessions.clear(this.store.slug());
    void this.router.navigate(['/p', this.store.slug(), 'login']);
  }
}
