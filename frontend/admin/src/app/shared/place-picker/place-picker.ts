import { Component, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';

import { GeoCity, GeoDistrict, GeoRegion, GeoService } from '../../core/geo.service';
import { LanguageService } from '../../core/i18n/language.service';

/** Value of the picker: lookup ids, plus a typed district for cities that have no district list. */
export interface PlaceValue {
  cityId: number | null;
  districtId: number | null;
  district: string | null;
}

/**
 * City → district selects backed by the Saudi lookup. Districts are filtered by the chosen city; when a
 * city has no district data the user can type the district instead. Works with formControlName and ngModel.
 */
@Component({
  selector: 'app-place-picker',
  imports: [FormsModule, TranslatePipe, InputText, Select],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlacePicker), multi: true }],
  styleUrl: './place-picker.scss',
  host: { '[class.stack]': 'stack()' },
  templateUrl: './place-picker.html',
})
export class PlacePicker implements ControlValueAccessor {
  private readonly geo = inject(GeoService);
  private readonly lang = inject(LanguageService);

  readonly idPrefix = input('place');
  /** Stack the two selects on narrow screens. */
  readonly stack = input(false);

  protected readonly cities = signal<GeoCity[]>([]);
  protected readonly regions = signal<GeoRegion[]>([]);
  protected readonly districts = signal<GeoDistrict[]>([]);
  protected readonly cityId = signal<number | null>(null);
  protected readonly districtId = signal<number | null>(null);
  protected readonly districtText = signal<string | null>(null);
  protected readonly loadingDistricts = signal(false);
  protected readonly disabled = signal(false);

  private onChange: (v: PlaceValue) => void = () => {};
  private onTouched: () => void = () => {};

  protected readonly cityOptions = computed(() => {
    const ar = this.lang.current() === 'ar';
    const regionName = new Map(this.regions().map((r) => [r.id, ar ? r.nameAr : r.nameEn]));
    return this.cities().map((c) => ({
      id: c.id,
      label: ar ? c.nameAr : c.nameEn,
      alt: ar ? c.nameEn : c.nameAr,
      region: regionName.get(c.regionId) ?? '',
    }));
  });

  protected readonly districtOptions = computed(() => {
    const ar = this.lang.current() === 'ar';
    return this.districts().map((d) => ({ id: d.id, label: ar ? d.nameAr : d.nameEn, alt: ar ? d.nameEn : d.nameAr }));
  });

  constructor() {
    this.geo.cities().subscribe((c) => this.cities.set(c));
    this.geo.regions().subscribe((r) => this.regions.set(r));
  }

  writeValue(v: PlaceValue | null): void {
    this.cityId.set(v?.cityId ?? null);
    this.districtId.set(v?.districtId ?? null);
    this.districtText.set(v?.district ?? null);
    this.loadDistricts();
  }

  registerOnChange(fn: (v: PlaceValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  pickCity(id: number | null): void {
    if (id === this.cityId()) return;
    this.cityId.set(id);
    this.districtId.set(null);
    this.districtText.set(null);
    this.loadDistricts();
    this.emit();
  }

  pickDistrict(id: number | null): void {
    this.districtId.set(id);
    this.emit();
  }

  typeDistrict(text: string): void {
    this.districtText.set(text);
    this.emit();
  }

  private loadDistricts(): void {
    const id = this.cityId();
    this.districts.set([]);
    if (!id) return;
    this.loadingDistricts.set(true);
    this.geo.districts(id).subscribe({
      next: (d) => {
        this.loadingDistricts.set(false);
        if (this.cityId() === id) this.districts.set(d);
      },
      error: () => this.loadingDistricts.set(false),
    });
  }

  private emit(): void {
    this.onChange({ cityId: this.cityId(), districtId: this.districtId(), district: this.districtText()?.trim() || null });
    this.onTouched();
  }
}
