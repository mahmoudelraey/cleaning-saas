import { Pipe, PipeTransform, inject } from '@angular/core';

import { Addon, BookingItem, BookingSummary, Quote, Service } from './api.types';
import { Lang, LanguageService } from './language.service';

/** English when the visitor reads English and the company filled it in; otherwise the Arabic (main) text. */
export function pick(lang: Lang, ar: string | undefined | null, en: string | undefined | null): string {
  return (lang === 'en' && en?.trim()) || ar || '';
}

export function serviceName(s: Service, lang: Lang): string {
  return pick(lang, s.name, s.nameEn);
}

export function serviceDescription(s: Service, lang: Lang): string {
  return pick(lang, s.description, s.descriptionEn);
}

export function addonName(a: Addon, lang: Lang): string {
  return pick(lang, a.name, a.nameEn);
}

/**
 * A quote line in the visitor's language. The server writes lines in Arabic ("service — add-on"); when the line's
 * service is known, it is rebuilt from the catalog names.
 */
export function quoteLine(item: Quote['items'][number], services: Service[], lang: Lang): string {
  const s = services.find((x) => x.id === item.serviceId);
  if (!s) return item.description;
  if (!item.addonId) return serviceName(s, lang);
  const a = s.addons.find((x) => x.id === item.addonId);
  return a ? `${serviceName(s, lang)} — ${addonName(a, lang)}` : item.description;
}

/** Template helper: {{ s | svc }}, {{ s | svc: 'description' }}, {{ a | svc }} for an add-on. */
@Pipe({ name: 'svc', pure: false })
export class ServiceTextPipe implements PipeTransform {
  private readonly lang = inject(LanguageService);
  transform(x: Service | Addon | null | undefined, field: 'name' | 'description' = 'name'): string {
    if (!x) return '';
    const l = this.lang.current();
    if (field === 'description') return 'description' in x ? serviceDescription(x as Service, l) : '';
    return 'addons' in x ? serviceName(x as Service, l) : addonName(x as Addon, l);
  }
}

/** A visit's services as one line in the visitor's language: «تنظيف شقة، غسيل سيارة» / "Apartment cleaning, Car wash". */
@Pipe({ name: 'visitServices', pure: false })
export class VisitServicesPipe implements PipeTransform {
  private readonly lang = inject(LanguageService);
  transform(b: BookingSummary | null | undefined): string {
    if (!b) return '';
    const l = this.lang.current();
    const names = b.services.map((ar, i) => pick(l, ar, b.servicesEn?.[i]));
    return names.join(l === 'ar' ? '، ' : ', ');
  }
}

/** A booking line (service or add-on) in the visitor's language. */
@Pipe({ name: 'itemText', pure: false })
export class ItemTextPipe implements PipeTransform {
  private readonly lang = inject(LanguageService);
  transform(it: BookingItem | null | undefined): string {
    return it ? pick(this.lang.current(), it.description, it.descriptionEn) : '';
  }
}
