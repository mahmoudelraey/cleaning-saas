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

  protected line(a: Address): string {
    return [a.district, a.city, a.details].filter(Boolean).join('، ');
  }

  signOut(): void {
    this.sessions.clear(this.store.slug());
    void this.router.navigate(['/', this.store.slug(), 'login']);
  }
}
