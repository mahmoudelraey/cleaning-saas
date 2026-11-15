import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, model, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

import { Plan } from '../../core/api.types';
import { LanguageService } from '../../core/i18n/language.service';
import { SupportContactService } from '../../core/support';
import { TenantService } from '../../core/tenant.service';
import { UpgradeService } from '../../core/upgrade.service';
import { SarPipe } from '../../shared/format';

/** Plan picker opened from "Upgrade now". Paid plans are activated by support until online payment exists. */
@Component({
  selector: 'app-upgrade-dialog',
  imports: [TranslatePipe, Button, Dialog, SarPipe],
  styleUrl: './upgrade-dialog.scss',
  templateUrl: './upgrade-dialog.html',
})
export class UpgradeDialog {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly tenants = inject(TenantService);
  protected readonly lang = inject(LanguageService);

  readonly visible = model(false);

  private readonly supportContact = inject(SupportContactService);
  protected get support() {
    return this.supportContact.contact();
  }
  protected get hasContact(): boolean {
    return !!(this.support.whatsapp || this.support.email);
  }
  protected readonly plans = signal<Plan[]>([]);
  protected readonly currentPlanId = computed(() => this.tenants.tenant()?.plan?.id ?? null);
  protected readonly isTrial = computed(() => this.tenants.tenant()?.status === 'TRIAL');
  protected readonly upgrade = inject(UpgradeService);

  /** When opened for a locked feature: the cheapest plan that has it. */
  protected readonly featurePlan = computed(() => {
    const feature = this.upgrade.feature();
    const plan = feature ? [...this.plans()].sort((a, b) => a.priceMonthlyHalalas - b.priceMonthlyHalalas).find((p) => p.features.includes(feature)) : undefined;
    return feature && plan ? { feature, plan } : null;
  });

  /** Filled button: the plan that unlocks the requested feature, else the one they're on. */
  protected readonly recommendedId = computed(() => this.featurePlan()?.plan.id ?? this.currentPlanId() ?? 'pro');

  constructor() {
    effect(() => {
      if (this.visible()) this.supportContact.load();
      if (this.visible() && !this.plans().length) {
        this.http.get<Plan[]>('/api/v1/plans').subscribe({ next: (p) => this.plans.set(p), error: () => {} });
      }
    });
  }

  protected planName(p: Plan): string {
    return this.lang.current() === 'ar' ? p.nameAr : p.nameEn;
  }

  protected contactLink(p: Plan): string | null {
    const company = this.tenants.tenant()?.name ?? '';
    const plan = this.planName(p);
    const text = this.translate.instant('upgrade.message', { plan, company });
    if (this.support.whatsapp) {
      return `https://wa.me/${this.support.whatsapp}?text=${encodeURIComponent(text)}`;
    }
    if (this.support.email) {
      return `mailto:${this.support.email}?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text)}`;
    }
    return null;
  }
}
