import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { errorMessage } from '../../core/http/api-error';
import { SarPipe, toHalalas, toSar } from '../../shared/format';
import { PlanInput, PlanRow, PlatformApi } from './platform.api';

interface Draft {
  id: string;
  nameAr: string;
  nameEn: string;
  monthly: number | null;
  yearly: number | null;
  maxTechnicians: number | null;
  features: string[];
  active: boolean;
  sortOrder: number;
}

/** Subscription plans: names, monthly and yearly prices, technician limit, features, and whether it is offered. */
@Component({
  selector: 'app-platform-plans',
  imports: [FormsModule, TranslatePipe, Button, Dialog, InputNumber, InputText, Checkbox, ToggleSwitch, Tag, SarPipe],
  styles: `
    .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: .9rem; }
    .plan { display: grid; gap: .6rem; align-content: start; }
    .plan.off { opacity: .65; }
    .plan h2 { margin: 0; font-size: 1.05rem; display: flex; justify-content: space-between; gap: .5rem; align-items: center; }
    .price strong { font-size: 1.4rem; }
    .price span, .muted { color: var(--fo-muted); font-size: .85rem; }
    ul { margin: 0; padding-inline-start: 1.1rem; font-size: .88rem; display: grid; gap: .2rem; }
    .actions { display: flex; gap: .4rem; justify-content: flex-end; margin-top: auto; }
    .feats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
    @media (max-width: 560px) { .feats { grid-template-columns: 1fr; } }
    .feats label { display: flex; gap: .45rem; align-items: center; font-size: .9rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'platform.plans.title' | translate }}</h1>
        <p>{{ 'platform.plans.subtitle' | translate }}</p>
      </div>
      <p-button icon="pi pi-plus" [label]="'platform.plans.new' | translate" (onClick)="edit(null)" />
    </div>

    <div class="plans">
      @for (p of plans(); track p.id) {
        <div class="panel plan" [class.off]="!p.active">
          <h2>
            <span>{{ p.nameAr }} · {{ p.nameEn }}</span>
            <p-tag [value]="(p.active ? 'platform.plans.offered' : 'platform.hidden') | translate" [severity]="p.active ? 'success' : 'secondary'" />
          </h2>
          <div class="price"><strong class="ltr">{{ p.priceMonthlyHalalas | sar }}</strong> <span>/ {{ 'settings.month' | translate }}</span></div>
          <div class="muted">
            @if (p.priceYearlyHalalas !== null) {
              <span class="ltr">{{ p.priceYearlyHalalas | sar }}</span> / {{ 'upgrade.year' | translate }} · {{ 'platform.plans.saves' | translate: { p: discount(p) } }}
            } @else {
              {{ 'platform.plans.noYearly' | translate }}
            }
          </div>
          <div class="muted"><code>{{ p.id }}</code> · {{ 'upgrade.upTo' | translate: { n: p.maxTechnicians } }} · {{ 'platform.plans.companies' | translate: { n: p.companies } }}</div>
          <ul>
            @for (f of p.features; track f) { <li>{{ 'upgrade.features.' + f | translate }}</li> }
          </ul>
          <div class="actions">
            @if (!p.companies) {
              <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="remove(p)" [ariaLabel]="'common.delete' | translate" />
            }
            <p-button icon="pi pi-pencil" [label]="'common.edit' | translate" [outlined]="true" (onClick)="edit(p)" />
          </div>
        </div>
      }
    </div>

    <p-dialog [header]="(editingId() ? 'platform.plans.edit' : 'platform.plans.new') | translate" [(visible)]="open" [modal]="true" [style]="{ width: '640px', maxWidth: '95vw' }" [draggable]="false">
      @if (draft(); as d) {
        <div class="form-grid">
          @if (!editingId()) {
            <div class="field full">
              <label for="pl-id">{{ 'platform.plans.code' | translate }}</label>
              <input pInputText id="pl-id" [(ngModel)]="d.id" dir="ltr" maxlength="30" placeholder="starter" />
              <small class="hint">{{ 'platform.plans.codeHint' | translate }}</small>
            </div>
          }
          <div class="field">
            <label for="pl-ar">{{ 'platform.plans.nameAr' | translate }}</label>
            <input pInputText id="pl-ar" [(ngModel)]="d.nameAr" maxlength="100" />
          </div>
          <div class="field">
            <label for="pl-en">{{ 'platform.plans.nameEn' | translate }}</label>
            <input pInputText id="pl-en" [(ngModel)]="d.nameEn" maxlength="100" dir="ltr" />
          </div>
          <div class="field">
            <label for="pl-m">{{ 'platform.plans.monthly' | translate }}</label>
            <p-inputnumber inputId="pl-m" [(ngModel)]="d.monthly" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
          </div>
          <div class="field">
            <label for="pl-y">{{ 'platform.plans.yearly' | translate }}</label>
            <p-inputnumber inputId="pl-y" [(ngModel)]="d.yearly" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
            <small class="hint">{{ 'platform.plans.yearlyHint' | translate }}
              @if (d.monthly) { <button type="button" class="link" (click)="d.yearly = round(d.monthly * 10)">{{ 'platform.plans.twoMonthsFree' | translate }}</button> }
            </small>
          </div>
          <div class="field">
            <label for="pl-t">{{ 'platform.plans.maxTechnicians' | translate }}</label>
            <p-inputnumber inputId="pl-t" [(ngModel)]="d.maxTechnicians" [min]="1" [max]="1000" />
          </div>
          <div class="field">
            <label for="pl-o">{{ 'platform.plans.order' | translate }}</label>
            <p-inputnumber inputId="pl-o" [(ngModel)]="d.sortOrder" [min]="0" [max]="999" />
          </div>
          <div class="field full">
            <label>{{ 'platform.plans.features' | translate }}</label>
            <div class="feats">
              @for (f of features(); track f) {
                <label><p-checkbox [binary]="true" [ngModel]="d.features.includes(f)" (ngModelChange)="toggle(d, f, $event)" [inputId]="'f-' + f" />{{ 'upgrade.features.' + f | translate }}</label>
              }
            </div>
          </div>
          <div class="field full">
            <label for="pl-a">{{ 'platform.plans.offer' | translate }}</label>
            <p-toggleswitch inputId="pl-a" [(ngModel)]="d.active" />
            <small class="hint">{{ 'platform.plans.offerHint' | translate }}</small>
          </div>
          <div class="dialog-actions full">
            <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="open.set(false)" />
            <p-button [label]="'common.save' | translate" [loading]="saving()" (onClick)="save(d)" [disabled]="!d.nameAr || !d.nameEn || d.monthly === null || !d.maxTechnicians" />
          </div>
        </div>
      }
    </p-dialog>
  `,
})
export class PlatformPlansPage {
  private readonly api = inject(PlatformApi);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly plans = signal<PlanRow[]>([]);
  protected readonly features = signal<string[]>([]);
  protected readonly open = signal(false);
  protected readonly saving = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal<Draft | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.plans().subscribe({
      next: (r) => {
        this.plans.set(r.plans);
        this.features.set(r.features);
      },
      error: (e) => this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) }),
    });
  }

  /** Discount of the yearly price against 12 × monthly, in %. */
  protected discount(p: PlanRow): number {
    if (p.priceYearlyHalalas === null || !p.priceMonthlyHalalas) return 0;
    return Math.max(0, Math.round((1 - p.priceYearlyHalalas / (p.priceMonthlyHalalas * 12)) * 100));
  }

  protected round(n: number): number {
    return Math.round(n * 100) / 100;
  }

  protected edit(p: PlanRow | null): void {
    this.editingId.set(p?.id ?? null);
    this.draft.set({
      id: p?.id ?? '',
      nameAr: p?.nameAr ?? '',
      nameEn: p?.nameEn ?? '',
      monthly: p ? toSar(p.priceMonthlyHalalas) : null,
      yearly: p?.priceYearlyHalalas != null ? toSar(p.priceYearlyHalalas) : null,
      maxTechnicians: p?.maxTechnicians ?? 3,
      features: [...(p?.features ?? ['scheduling', 'customers', 'booking_page'])],
      active: p?.active ?? true,
      sortOrder: p?.sortOrder ?? this.plans().length + 1,
    });
    this.open.set(true);
  }

  protected toggle(d: Draft, f: string, on: boolean): void {
    d.features = on ? [...d.features.filter((x) => x !== f), f] : d.features.filter((x) => x !== f);
  }

  protected save(d: Draft): void {
    const body: PlanInput = {
      id: d.id.trim().toLowerCase(),
      nameAr: d.nameAr.trim(),
      nameEn: d.nameEn.trim(),
      priceMonthlyHalalas: toHalalas(d.monthly),
      priceYearlyHalalas: d.yearly === null ? null : toHalalas(d.yearly),
      maxTechnicians: d.maxTechnicians ?? 1,
      // Keep the order the features are listed in.
      features: this.features().filter((f) => d.features.includes(f)),
      active: d.active,
      sortOrder: d.sortOrder,
    };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.updatePlan(id, body) : this.api.createPlan(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.open.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected remove(p: PlanRow): void {
    this.confirm.confirm({
      header: this.translate.instant('platform.plans.deleteTitle'),
      message: this.translate.instant('platform.plans.deleteConfirm', { n: p.nameEn }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.api.deletePlan(p.id).subscribe({
          next: () => this.load(),
          error: (e) => this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) }),
        }),
    });
  }
}
