import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Observable, concat, of, toArray } from 'rxjs';

import { PricingType, ServiceOffering } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe, toHalalas, toSar } from '../../shared/format';
import { defaultServiceImage } from '../../shared/service-image';

const BASE = '/api/v1/services';

function makeAddonGroup(fb: FormBuilder, id: string | null, name: string, nameEn: string, price: number, active: boolean) {
  return fb.nonNullable.group({
    id: [id as string | null],
    name: [name, [Validators.maxLength(150)]],
    nameEn: [nameEn, [Validators.maxLength(150)]],
    price: [price, [Validators.min(0)]],
    active: [active],
  });
}
type AddonGroup = ReturnType<typeof makeAddonGroup>;

@Component({
  selector: 'app-services',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TableModule,
    Button,
    Dialog,
    InputText,
    InputNumber,
    Select,
    Textarea,
    ToggleSwitch,
    Tag,
    SarPipe,
  ],
  styles: `
    .addons { display: flex; flex-wrap: wrap; gap: .35rem; }
    .addon-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 140px) auto auto; gap: .5rem; align-items: center; }
    @media (max-width: 640px) { .addon-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    .missing-en { font-size: .75rem; color: var(--p-orange-600, #c2410c); margin-top: .2rem; }
    .hint { color: var(--fo-muted); font-size: .8rem; }
    .addon-row > * { min-width: 0; }
    .addon-row + .addon-row { margin-top: .5rem; }
    h3 { margin: .5rem 0; font-size: 1rem; }
    /* Service photo: a thumbnail in the list, a preview with change/remove in the dialog. */
    .name-cell { display: flex; align-items: center; gap: .75rem; }
    .thumb { width: 64px; height: 44px; flex: none; border-radius: 10px; object-fit: cover; background: var(--p-surface-100, #f1f5f9); }
    .photo { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .photo img { width: 220px; height: 120px; object-fit: cover; border-radius: 14px; border: 1px solid var(--fo-border); }
    .photo .side { display: flex; flex-direction: column; gap: .5rem; align-items: flex-start; }
    .photo input[type=file] { display: none; }
    .badge-default { font-size: .75rem; color: var(--fo-muted); }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'services.title' | translate }}</h1>
        <p>{{ 'services.subtitle' | translate }}</p>
      </div>
      @if (isOwner) {
        <p-button icon="pi pi-plus" [label]="'services.new' | translate" (onClick)="open(null)" />
      }
    </div>

    <div class="panel-flush">
      <p-table [value]="services()" [loading]="loading()" [rowHover]="true" dataKey="id">
        <ng-template #header>
          <tr>
            <th>{{ 'services.name' | translate }}</th>
            <th>{{ 'services.pricing' | translate }}</th>
            <th>{{ 'services.price' | translate }}</th>
            <th>{{ 'services.duration' | translate }}</th>
            <th>{{ 'services.addons' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
            @if (isOwner) {
              <th></th>
            }
          </tr>
        </ng-template>
        <ng-template #body let-s>
          <tr>
            <td>
              <div class="name-cell">
                <img class="thumb" [src]="s.imageUrl || defaultImage(s.name, s.nameEn)" alt="" loading="lazy" />
                <div>
                  <strong>{{ label(s.name, s.nameEn) }}</strong>
                  @if (label(s.description, s.descriptionEn); as d) {
                    <div class="muted">{{ d }}</div>
                  }
                  @if (!s.nameEn) {
                    <div class="missing-en"><i class="pi pi-language"></i> {{ 'services.noEnglish' | translate }}</div>
                  }
                </div>
              </div>
            </td>
            <td>{{ 'services.pricingTypes.' + s.pricingType | translate }}</td>
            <td><span class="ltr">{{ s.basePriceHalalas | sar }}</span></td>
            <td>{{ 'services.minutes' | translate: { n: s.durationMin } }}</td>
            <td>
              <div class="addons">
                @for (a of s.addons; track a.id) {
                  <p-tag [value]="label(a.name, a.nameEn)" severity="secondary" />
                }
              </div>
            </td>
            <td>
              <p-tag
                [value]="(s.active ? 'common.active' : 'common.inactive') | translate"
                [severity]="s.active ? 'success' : 'secondary'"
              />
            </td>
            @if (isOwner) {
              <td class="row-actions">
                <p-button icon="pi pi-pencil" [text]="true" severity="secondary" (onClick)="open(s)" />
              </td>
            }
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="7"><div class="empty"><i class="pi pi-list-check"></i>{{ 'services.empty' | translate }}</div></td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    <p-dialog
      [header]="(editing() ? 'services.edit' : 'services.new') | translate"
      [(visible)]="dialogOpen"
      [modal]="true"
      [style]="{ width: '680px', maxWidth: '95vw' }"
      [draggable]="false"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
        <!-- Photo for the service card on the company's public page -->
        <div class="field full">
          <label>{{ 'services.photo' | translate }}</label>
          <div class="photo">
            <img [src]="photoPreview()" alt="" />
            <div class="side">
              <input #photoInput type="file" accept="image/jpeg,image/png,image/webp" (change)="pickPhoto(photoInput)" />
              <p-button icon="pi pi-upload" size="small" [outlined]="true" [label]="'services.choosePhoto' | translate" (onClick)="photoInput.click()" />
              @if (hasOwnPhoto()) {
                <p-button icon="pi pi-trash" size="small" severity="danger" [text]="true" [label]="'services.useDefaultPhoto' | translate" (onClick)="clearPhoto()" />
              } @else {
                <span class="badge-default"><i class="pi pi-image"></i> {{ 'services.defaultPhoto' | translate }}</span>
              }
              <small class="hint">{{ 'services.photoHint' | translate }}</small>
            </div>
          </div>
        </div>
        <div class="field">
          <label for="s-name">{{ 'services.nameAr' | translate }}</label>
          <input pInputText id="s-name" dir="rtl" formControlName="name" placeholder="مثال: تنظيف شقة" />
        </div>
        <div class="field">
          <label for="s-name-en">{{ 'services.nameEn' | translate }}</label>
          <input pInputText id="s-name-en" dir="ltr" formControlName="nameEn" placeholder="e.g. Apartment cleaning" />
        </div>
        <div class="field">
          <label for="s-desc">{{ 'services.descriptionAr' | translate }}</label>
          <textarea pTextarea id="s-desc" dir="rtl" formControlName="description" rows="2"></textarea>
        </div>
        <div class="field">
          <label for="s-desc-en">{{ 'services.descriptionEn' | translate }}</label>
          <textarea pTextarea id="s-desc-en" dir="ltr" formControlName="descriptionEn" rows="2"></textarea>
        </div>
        <small class="hint full">{{ 'services.englishHint' | translate }}</small>
        <div class="field">
          <label for="s-type">{{ 'services.pricing' | translate }}</label>
          <p-select inputId="s-type" formControlName="pricingType" [options]="pricingOptions()" optionLabel="label" optionValue="value" />
        </div>
        <div class="field">
          <label for="s-price">{{ 'services.priceSar' | translate }}</label>
          <p-inputnumber inputId="s-price" formControlName="price" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" />
        </div>
        <div class="field">
          <label for="s-dur">{{ 'services.durationMin' | translate }}</label>
          <p-inputnumber inputId="s-dur" formControlName="durationMin" [min]="5" [max]="1440" [step]="15" [showButtons]="true" />
        </div>
        <div class="field">
          <label for="s-active">{{ 'common.active' | translate }}</label>
          <p-toggleswitch inputId="s-active" formControlName="active" />
        </div>

        <div class="full">
          <h3>{{ 'services.addons' | translate }}</h3>
          <div formArrayName="addons">
            @for (g of addons.controls; track g; let i = $index) {
              <div class="addon-row" [formGroupName]="i">
                <input pInputText dir="rtl" formControlName="name" [placeholder]="'services.addonNameAr' | translate" />
                <input pInputText dir="ltr" formControlName="nameEn" [placeholder]="'services.addonNameEn' | translate" />
                <p-inputnumber formControlName="price" mode="decimal" [maxFractionDigits]="2" [min]="0" [placeholder]="'services.priceSar' | translate" />
                <p-toggleswitch formControlName="active" />
                <p-button icon="pi pi-times" [text]="true" severity="danger" (onClick)="removeAddon(i)" />
              </div>
            }
          </div>
          <p-button icon="pi pi-plus" size="small" [text]="true" [label]="'services.addAddon' | translate" (onClick)="addAddon()" />
        </div>

        <div class="dialog-actions full">
          @if (editing()) {
            <span style="margin-inline-end: auto">
              <p-button [label]="'services.archive' | translate" severity="danger" [text]="true" (onClick)="archive()" />
            </span>
          }
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class ServicesPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  protected readonly isOwner = inject(AuthService).hasRole('OWNER');

  protected readonly services = signal<ServiceOffering[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<ServiceOffering | null>(null);

  // --- photo (applied after the service itself is saved) ---
  /** A newly chosen file, and its preview. */
  private pendingPhoto: File | null = null;
  private readonly pendingPreview = signal<string | null>(null);
  /** The owner removed the current photo (back to the default picture). */
  private readonly removePhoto = signal(false);
  private readonly nameValue = signal('');
  protected readonly defaultImage = defaultServiceImage;
  protected readonly hasOwnPhoto = () => !!this.pendingPreview() || (!!this.editing()?.imageUrl && !this.removePhoto());
  protected readonly photoPreview = (): string =>
    this.pendingPreview() ||
    (!this.removePhoto() && this.editing()?.imageUrl) ||
    defaultServiceImage(this.nameValue(), this.form.controls.nameEn.value);

  protected readonly pricingOptions = () =>
    (['FIXED', 'HOURLY', 'PER_SQM'] as PricingType[]).map((v) => ({
      value: v,
      label: this.translate.instant('services.pricingTypes.' + v),
    }));

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
    nameEn: ['', [Validators.maxLength(150)]],
    descriptionEn: [''],
    pricingType: ['FIXED' as PricingType, Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    durationMin: [120, [Validators.required, Validators.min(5), Validators.max(1440)]],
    active: [true],
    addons: this.fb.array<AddonGroup>([]),
  });

  get addons(): FormArray<AddonGroup> {
    return this.form.controls.addons;
  }

  ngOnInit(): void {
    this.reload();
    this.form.controls.name.valueChanges.subscribe((v) => this.nameValue.set(v ?? ''));
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<ServiceOffering[]>(BASE).subscribe({
      next: (s) => {
        this.services.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(s: ServiceOffering | null): void {
    this.editing.set(s);
    this.pendingPhoto = null;
    this.setPreview(null);
    this.removePhoto.set(false);
    this.nameValue.set(s?.name ?? '');
    this.addons.clear();
    this.form.reset({
      name: s?.name ?? '',
      description: s?.description ?? '',
      nameEn: s?.nameEn ?? '',
      descriptionEn: s?.descriptionEn ?? '',
      pricingType: s?.pricingType ?? 'FIXED',
      price: s ? toSar(s.basePriceHalalas) : 0,
      durationMin: s?.durationMin ?? 120,
      active: s?.active ?? true,
    });
    s?.addons.forEach((a) => this.addons.push(this.addonGroup(a.id, a.name, a.nameEn ?? '', toSar(a.priceHalalas), a.active)));
    this.dialogOpen.set(true);
  }

  addAddon(): void {
    this.addons.push(this.addonGroup(null, '', '', 0, true));
  }

  removeAddon(i: number): void {
    this.addons.removeAt(i);
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const body = {
      name: v.name,
      description: v.description || null,
      nameEn: v.nameEn.trim() || null,
      descriptionEn: v.descriptionEn.trim() || null,
      pricingType: v.pricingType,
      basePriceHalalas: toHalalas(v.price),
      durationMin: v.durationMin,
      active: v.active,
    };
    const existing = this.editing();
    this.saving.set(true);
    const saveService$ = existing
      ? this.http.put<ServiceOffering>(`${BASE}/${existing.id}`, body)
      : this.http.post<ServiceOffering>(BASE, body);

    saveService$.subscribe({
      next: (saved) => {
        concat(this.syncAddons(saved, existing), this.syncPhoto(saved))
          .pipe(toArray())
          .subscribe({
            next: () => this.done(),
            error: (err) => this.fail(err),
          });
      },
      error: (err) => this.fail(err),
    });
  }

  protected pickPhoto(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      this.messages.add({ severity: 'error', summary: this.translate.instant('errors.file_too_large') });
      return;
    }
    this.pendingPhoto = file;
    this.removePhoto.set(false);
    this.setPreview(URL.createObjectURL(file));
  }

  protected clearPhoto(): void {
    this.pendingPhoto = null;
    this.setPreview(null);
    this.removePhoto.set(true);
  }

  /** Uploads the chosen photo, or removes the current one, once the service is saved. */
  private syncPhoto(saved: ServiceOffering): Observable<unknown> {
    if (this.pendingPhoto) {
      const data = new FormData();
      data.append('file', this.pendingPhoto);
      return this.http.post(`${BASE}/${saved.id}/image`, data);
    }
    if (this.removePhoto() && saved.imageUrl) {
      return this.http.delete(`${BASE}/${saved.id}/image`);
    }
    return of(null);
  }

  private setPreview(url: string | null): void {
    const old = this.pendingPreview();
    if (old) URL.revokeObjectURL(old);
    this.pendingPreview.set(url);
  }

  archive(): void {
    const s = this.editing();
    if (!s) {
      return;
    }
    this.confirm.confirm({
      message: this.translate.instant('services.confirmArchive', { name: s.name }),
      acceptLabel: this.translate.instant('services.archive'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.http.delete(`${BASE}/${s.id}`).subscribe({ next: () => this.done(), error: (e) => this.fail(e) }),
    });
  }

  /** Applies add-on create/update/delete calls sequentially against the saved service. */
  private syncAddons(saved: ServiceOffering, existing: ServiceOffering | null): Observable<unknown> {
    const rows = this.addons.getRawValue();
    const keptIds = new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
    const calls: Observable<unknown>[] = [];
    for (const r of rows) {
      if (!r.name.trim()) {
        continue;
      }
      const body = { name: r.name, nameEn: r.nameEn.trim() || null, priceHalalas: toHalalas(r.price), active: r.active };
      calls.push(
        r.id
          ? this.http.put(`${BASE}/${saved.id}/addons/${r.id}`, body)
          : this.http.post(`${BASE}/${saved.id}/addons`, body),
      );
    }
    for (const a of existing?.addons ?? []) {
      if (!keptIds.has(a.id)) {
        calls.push(this.http.delete(`${BASE}/${saved.id}/addons/${a.id}`));
      }
    }
    return calls.length ? concat(...calls).pipe(toArray()) : of([]);
  }

  private addonGroup(id: string | null, name: string, nameEn: string, price: number, active: boolean): AddonGroup {
    return makeAddonGroup(this.fb, id, name, nameEn, price, active);
  }

  /** The text in the admin's language: English when it is chosen and filled in, otherwise the Arabic. */
  protected label(ar: string | undefined, en: string | undefined): string {
    return (this.lang.current() === 'en' && en?.trim()) || ar || '';
  }

  private done(): void {
    this.saving.set(false);
    this.dialogOpen.set(false);
    this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
    this.reload();
  }

  private fail(err: unknown): void {
    this.saving.set(false);
    this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
    this.reload();
  }
}
