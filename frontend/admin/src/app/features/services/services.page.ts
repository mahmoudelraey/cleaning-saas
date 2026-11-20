import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';
import { Observable, concat, of, toArray } from 'rxjs';

import { PricingType, ServiceOffering } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe, toHalalas, toSar } from '../../shared/format';
import { defaultServiceImage } from '../../shared/service-image';
import { AuditBlock, CreatedBy } from '../../shared/details-dialog/audit-block';

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

/** A sub-service (e.g. small / medium / large car) with its own price and, optionally, its own duration. */
function makeOptionGroup(
  fb: FormBuilder,
  id: string | null,
  name: string,
  nameEn: string,
  price: number,
  durationMin: number | null,
  active: boolean,
) {
  return fb.group({
    id: fb.control<string | null>(id),
    name: fb.nonNullable.control(name, [Validators.maxLength(150)]),
    nameEn: fb.nonNullable.control(nameEn, [Validators.maxLength(150)]),
    price: fb.nonNullable.control(price, [Validators.min(0)]),
    durationMin: fb.control<number | null>(durationMin, [Validators.min(5), Validators.max(1440)]),
    active: fb.nonNullable.control(active),
  });
}
type OptionGroup = ReturnType<typeof makeOptionGroup>;

@Component({
  selector: 'app-services',
  imports: [
    AuditBlock,
    CreatedBy,
    ReactiveFormsModule,
    TranslatePipe,
    TableModule,
    Button,
    Dialog,
    InputText,
    InputNumber,
    Textarea,
    ToggleSwitch,
    Tooltip,
    Tag,
    SarPipe,
  ],
  styleUrl: './services.page.scss',
  templateUrl: './services.page.html',
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
  /** The service shown in the details dialog. */
  protected readonly viewing = signal<ServiceOffering | null>(null);
  protected readonly viewOpen = signal(false);

  // --- photo (applied after the service itself is saved) ---
  /** A newly chosen file, and its preview. */
  private pendingPhoto: File | null = null;
  private readonly pendingPreview = signal<string | null>(null);
  /** The owner removed the current photo (back to the default picture). */
  private readonly removePhoto = signal(false);
  protected readonly nameValue = signal('');
  protected readonly defaultImage = defaultServiceImage;
  /** Our ready-made pictures the owner can pick instead of uploading one. */
  protected readonly gallery = [
    { key: 'home', src: 'services/home.jpg', label: 'services.gallery.home' },
    { key: 'car', src: 'services/car.jpg', label: 'services.gallery.car' },
  ];
  /** What the photo picker shows as selected: no photo (auto), one of our pictures, or the owner's own photo. */
  protected readonly choice = signal<string>('auto');
  /** One of our pictures picked in the dialog, saved by name when the service is saved (nothing is uploaded). */
  private pendingPreset: string | null = null;
  /** The owner's own photo (new upload, or the uploaded one already saved; our pictures don't count). */
  protected readonly ownPreview = () => {
    const saved = this.editing()?.imageUrl ?? null;
    return this.pendingOwn() ?? (saved && !presetOf(saved) ? saved : null);
  };
  private readonly pendingOwn = signal<string | null>(null);
  private ownFile: File | null = null;

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
    options: this.fb.array<OptionGroup>([]),
  });

  /** Pricing type picked from the cards in the dialog. */
  protected setPricing(v: PricingType): void {
    this.form.controls.pricingType.setValue(v);
    this.form.controls.pricingType.markAsDirty();
  }

  protected pricingIcon(v: PricingType): string {
    return v === 'HOURLY' ? 'pi-clock' : v === 'PER_SQM' ? 'pi-expand' : 'pi-tag';
  }

  get addons(): FormArray<AddonGroup> {
    return this.form.controls.addons;
  }

  get options(): FormArray<OptionGroup> {
    return this.form.controls.options;
  }

  /** Options that will be offered to customers (named and switched on). */
  protected hasActiveOptions(): boolean {
    return this.options.controls.some((g) => g.controls.active.value && g.controls.name.value.trim());
  }

  /** Active options of a saved service, in their order. */
  protected activeOptions(s: ServiceOffering) {
    return (s.options ?? []).filter((o) => o.active);
  }

  /** The lowest active option price ("from …" in the list), or the base price without options. */
  protected fromPrice(s: ServiceOffering): number {
    const prices = this.activeOptions(s).map((o) => o.priceHalalas);
    return prices.length ? Math.min(...prices) : s.basePriceHalalas;
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

  /** Read-only details: photo, names, prices, options and add-ons. */
  view(s: ServiceOffering): void {
    this.viewing.set(s);
    this.viewOpen.set(true);
  }

  /** From the details dialog straight to editing the same service. */
  editFromView(): void {
    const s = this.viewing();
    this.viewOpen.set(false);
    if (s) this.open(s);
  }

  open(s: ServiceOffering | null): void {
    this.editing.set(s);
    this.pendingPhoto = null;
    this.pendingPreset = null;
    this.setPreview(null);
    this.pendingOwn.set(null);
    this.ownFile = null;
    this.removePhoto.set(false);
    // A new service starts without a photo (the page shows a default picture chosen from its name).
    this.choice.set(s?.imageUrl ? (presetOf(s.imageUrl) ?? 'own') : 'auto');
    this.nameValue.set(s?.name ?? '');
    this.addons.clear();
    this.options.clear();
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
    (s?.options ?? []).forEach((o) =>
      this.options.push(
        makeOptionGroup(this.fb, o.id, o.name, o.nameEn ?? '', toSar(o.priceHalalas), o.durationMin ?? null, o.active),
      ),
    );
    this.dialogOpen.set(true);
  }

  addAddon(): void {
    this.addons.push(this.addonGroup(null, '', '', 0, true));
  }

  removeAddon(i: number): void {
    this.addons.removeAt(i);
  }

  addOption(): void {
    this.options.push(makeOptionGroup(this.fb, null, '', '', 0, null, true));
  }

  removeOption(i: number): void {
    this.options.removeAt(i);
  }

  /** Moves an option up or down; the order is the one customers see. */
  moveOption(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= this.options.length) return;
    const g = this.options.at(i);
    this.options.removeAt(i);
    this.options.insert(j, g);
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
        concat(this.syncAddons(saved, existing), this.syncOptions(saved, existing), this.syncPhoto(saved))
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
    this.pendingPreset = null;
    this.removePhoto.set(false);
    this.setPreview(URL.createObjectURL(file));
    this.ownFile = file;
    this.pendingOwn.set(this.pendingPreview());
    this.choice.set('own');
  }

  /** No photo: the public page shows the default picture that matches the service name. */
  protected chooseAuto(): void {
    this.pendingPhoto = null;
    this.pendingPreset = null;
    this.removePhoto.set(true);
    this.choice.set('auto');
  }

  /** One of our pictures: saved by name (the apps serve it from public/services), so no copy is uploaded. */
  protected chooseGallery(g: { key: string; src: string }): void {
    this.choice.set(g.key);
    this.pendingPreset = g.key;
    this.pendingPhoto = null;
    this.removePhoto.set(false);
  }

  /** Back to the owner's own photo (the one just uploaded, or the saved one). */
  protected chooseOwn(): void {
    if (!this.ownPreview()) return;
    // A new upload is sent again; a saved photo is simply kept.
    this.pendingPhoto = this.pendingOwn() ? this.ownFile : null;
    this.pendingPreset = null;
    this.removePhoto.set(false);
    this.choice.set('own');
  }

  /** Uploads the chosen photo, or removes the current one, once the service is saved. */
  private syncPhoto(saved: ServiceOffering): Observable<unknown> {
    if (this.pendingPreset) {
      return presetOf(saved.imageUrl) === this.pendingPreset
        ? of(null)
        : this.http.put(`${BASE}/${saved.id}/image/preset`, { preset: this.pendingPreset });
    }
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

  /**
   * The row's on/off button: deactivating (archive) asks first — the service disappears from new bookings but stays
   * on past ones; reactivating saves the service as it is with active = true.
   */
  toggleActive(s: ServiceOffering): void {
    if (!s.active) {
      const body = {
        name: s.name,
        description: s.description || null,
        nameEn: s.nameEn || null,
        descriptionEn: s.descriptionEn || null,
        pricingType: s.pricingType,
        basePriceHalalas: s.basePriceHalalas,
        durationMin: s.durationMin,
        active: true,
      };
      this.http.put(`${BASE}/${s.id}`, body).subscribe({ next: () => this.done(), error: (e) => this.fail(e) });
      return;
    }
    this.confirm.confirm({
      message: this.translate.instant('services.confirmArchive', { name: s.name }),
      acceptLabel: this.translate.instant('services.deactivate'),
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

  /**
   * Applies option create/update/delete calls sequentially. Deletes go first so a removed option never blocks
   * a new one; each row sends its position so the saved order matches the form.
   */
  private syncOptions(saved: ServiceOffering, existing: ServiceOffering | null): Observable<unknown> {
    const rows = this.options.getRawValue().filter((r) => r.name.trim());
    const keptIds = new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
    const calls: Observable<unknown>[] = [];
    for (const o of existing?.options ?? []) {
      if (!keptIds.has(o.id)) {
        calls.push(this.http.delete(`${BASE}/${saved.id}/options/${o.id}`));
      }
    }
    rows.forEach((r, position) => {
      const body = {
        name: r.name,
        nameEn: r.nameEn.trim() || null,
        priceHalalas: toHalalas(r.price),
        durationMin: r.durationMin || null,
        active: r.active,
        position,
      };
      calls.push(
        r.id
          ? this.http.put(`${BASE}/${saved.id}/options/${r.id}`, body)
          : this.http.post(`${BASE}/${saved.id}/options`, body),
      );
    });
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

/** "home" / "car" when the service uses one of our pictures ("/services/home.jpg"); null for an upload or none. */
function presetOf(url?: string | null): string | null {
  return url?.match(/^\/services\/([a-z]+)\.jpg$/)?.[1] ?? null;
}
