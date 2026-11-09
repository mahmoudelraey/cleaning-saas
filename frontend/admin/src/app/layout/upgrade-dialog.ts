import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, model, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

import { Plan } from '../core/api.types';
import { LanguageService } from '../core/i18n/language.service';
import { SupportContactService } from '../core/support';
import { TenantService } from '../core/tenant.service';
import { UpgradeService } from '../core/upgrade.service';
import { SarPipe } from '../shared/format';

/** Plan picker opened from "Upgrade now". Paid plans are activated by support until online payment exists. */
@Component({
  selector: 'app-upgrade-dialog',
  imports: [TranslatePipe, Button, Dialog, SarPipe],
  styles: `
    .intro { margin: 0 0 1.1rem; color: var(--fo-muted); }
    .feature-intro { color: var(--fo-text); background: color-mix(in srgb, #f59e0b 10%, transparent); border-radius: 10px;
                     padding: .65rem .85rem; display: flex; gap: .5rem; align-items: center; }
    .feature-intro i { color: #b45309; }
    li.hl { font-weight: 700; }
    .plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .9rem; }
    @media (max-width: 760px) { .plans { grid-template-columns: minmax(0, 1fr); } }
    .plan { position: relative; border: 1px solid var(--fo-border); border-radius: 14px; padding: 1.1rem 1rem 1rem; display: flex; flex-direction: column; gap: .75rem; }
    .plan.current { border-color: var(--p-primary-400); box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-primary-500) 15%, transparent); }
    .badge { position: absolute; top: -.65rem; inset-inline-start: 1rem; font-size: .72rem; font-weight: 700; padding: .15rem .6rem; border-radius: 999px;
             background: var(--p-primary-600); color: #fff; }
    .badge.popular { background: #f59e0b; }
    .plan h3 { margin: 0; font-size: 1.05rem; }
    .price { display: flex; align-items: baseline; gap: .35rem; }
    .price strong { font-size: 1.45rem; font-weight: 800; }
    .price span { color: var(--fo-muted); font-size: .82rem; }
    .yearly { color: var(--fo-muted); font-size: .8rem; margin-top: -.4rem; }
    .techs { font-size: .85rem; color: var(--fo-muted); display: flex; gap: .4rem; align-items: center; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; flex: 1; }
    li { display: flex; gap: .45rem; align-items: flex-start; font-size: .85rem; }
    li i { color: var(--p-green-600); font-size: .75rem; margin-top: .3rem; }
    .plan p-button ::ng-deep .p-button, .plan a ::ng-deep .p-button { width: 100%; justify-content: center; }
    .note { margin: 1.1rem 0 0; font-size: .82rem; color: var(--fo-muted); display: flex; gap: .45rem; align-items: center; }
    .loading { text-align: center; padding: 2rem 0; color: var(--fo-muted); }
  `,
  template: `
    <p-dialog [header]="'upgrade.title' | translate" [(visible)]="visible" [modal]="true" [dismissableMask]="true" [draggable]="false"
              [style]="{ width: '920px', maxWidth: '95vw' }">
      @if (featurePlan(); as fp) {
        <p class="intro feature-intro">
          <i class="pi pi-lock"></i>
          {{ 'upgrade.featureIntro' | translate: { feature: ('upgrade.features.' + fp.feature | translate), plan: planName(fp.plan) } }}
        </p>
      } @else {
        <p class="intro">{{ 'upgrade.intro' | translate }}</p>
      }

      @if (plans().length) {
        <div class="plans">
          @for (p of plans(); track p.id) {
            <div class="plan" [class.current]="p.id === currentPlanId()">
              @if (p.id === currentPlanId()) {
                <span class="badge">{{ (isTrial() ? 'upgrade.trialPlan' : 'upgrade.currentPlan') | translate }}</span>
              } @else if (p.id === 'pro') {
                <span class="badge popular">{{ 'upgrade.popular' | translate }}</span>
              }
              <h3>{{ planName(p) }}</h3>
              <div class="price">
                <strong class="ltr">{{ p.priceMonthlyHalalas | sar }}</strong>
                <span>/ {{ 'settings.month' | translate }}</span>
              </div>
              @if (p.priceYearlyHalalas) {
                <div class="yearly">{{ 'upgrade.orYearly' | translate }} <span class="ltr">{{ p.priceYearlyHalalas | sar }}</span> / {{ 'upgrade.year' | translate }}</div>
              }
              <div class="techs"><i class="pi pi-users"></i>{{ 'upgrade.upTo' | translate: { n: p.maxTechnicians } }}</div>
              <ul>
                @for (f of p.features; track f) {
                  <li [class.hl]="f === upgrade.feature()"><i class="pi pi-check"></i>{{ 'upgrade.features.' + f | translate }}</li>
                }
              </ul>
              @if (contactLink(p); as href) {
                <a [href]="href" target="_blank" rel="noopener">
                  <p-button
                    [icon]="support.whatsapp ? 'pi pi-whatsapp' : 'pi pi-envelope'"
                    [label]="'upgrade.choose' | translate"
                    [outlined]="p.id !== recommendedId()"
                  />
                </a>
              }
            </div>
          }
        </div>
        <p class="note">
          <i class="pi pi-info-circle"></i>
          {{ (hasContact ? 'upgrade.howItWorks' : 'subscription.next') | translate }}
        </p>
      } @else {
        <div class="loading"><i class="pi pi-spin pi-spinner"></i></div>
      }
    </p-dialog>
  `,
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
