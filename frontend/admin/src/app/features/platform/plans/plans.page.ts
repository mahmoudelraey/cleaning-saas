import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { AppDialog } from '../../../shared/dialog/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { errorMessage } from '../../../core/http/api-error';
import { SarPipe, toHalalas, toSar } from '../../../shared/format';
import { PlanInput, PlanRow, PlatformApi } from '../platform.api';

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
  imports: [FormsModule, TranslatePipe, Button, AppDialog, InputNumber, InputText, Checkbox, ToggleSwitch, Tag, SarPipe],
  styleUrl: './plans.page.scss',
  templateUrl: './plans.page.html',
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
