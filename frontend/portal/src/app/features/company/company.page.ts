import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PublicReviews, Service } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe, PhonePipe, SarPipe } from '../../core/format';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { GoogleReviews } from './google-reviews';
import { Stars } from './stars';
import { ServiceTextPipe } from '../../core/service-names';
import { socialLinks } from '../../core/socials';

/**
 * The company's public page at {portal}/{slug}: what they do, what it costs, what customers say and how to
 * reach them, with booking one tap away. One bold element (the hero and its water line); the rest stays quiet.
 */
@Component({
  selector: 'pt-company',
  imports: [RouterLink, NgTemplateOutlet, TranslatePipe, SarPipe, PhonePipe, LocalDatePipe, Stars, GoogleReviews, ServiceTextPipe],
  styleUrl: './company.page.scss',
  templateUrl: './company.page.html',
})
export class CompanyPage implements OnInit {
  protected readonly store = inject(CompanyStore);
  protected readonly lang = inject(LanguageService);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);

  protected readonly slug = this.store.slug;
  protected readonly company = this.store.company;
  protected readonly page = computed(() => this.company()?.page ?? {});
  protected readonly services = signal<Service[] | null>(null);
  protected readonly reviews = signal<PublicReviews | null>(null);
  protected readonly allServices = signal(false);
  /**
   * Hero picture: a photo dropped in public/hero/cover.jpg wins; otherwise the built-in illustration
   * (public/hero/cover.svg); if neither loads, the curve side stays plain teal.
   */
  private static readonly COVERS = ['hero/cover.jpg', 'hero/cover.svg'];
  private readonly coverIndex = signal(0);
  protected readonly cover = computed(() => CompanyPage.COVERS[this.coverIndex()] ?? null);

  protected readonly shownServices = computed(() => {
    const s = this.services() ?? [];
    return this.allServices() ? s : s.slice(0, 6);
  });
  protected readonly areas = computed(() =>
    (this.page().areas ?? '')
      .split(/[,،\n]+/)
      .map((a) => a.trim())
      .filter(Boolean),
  );
  protected readonly socials = computed(() => socialLinks(this.page()));
  protected readonly whatsappUrl = computed(() => {
    const n = this.page().whatsapp?.replace(/\D/g, '');
    if (!n) return null;
    const text = this.translate.instant('company.whatsappText', { name: this.company()?.name ?? '' });
    return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
  });
  protected readonly hasContact = computed(
    () => !!(this.company()?.phone || this.whatsappUrl() || this.company()?.address || this.page().hours || this.socials().length),
  );

  ngOnInit(): void {
    const slug = this.slug();
    this.api.services(slug).subscribe({ next: (s) => this.services.set(s), error: () => this.services.set([]) });
    this.api.reviews(slug).subscribe({ next: (r) => this.reviews.set(r), error: () => this.reviews.set(null) });
  }

  protected nextCover(): void {
    this.coverIndex.update((i) => i + 1);
  }

  protected duration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return this.translate.instant('company.minutes', { m });
    return m ? this.translate.instant('company.hoursMinutes', { h, m }) : this.translate.instant('company.hours', { h });
  }

  /** A fitting icon from the service's name (Arabic or English); a sparkle when nothing matches. */
  protected serviceIcon(name: string): string {
    const n = (name ?? '').toLowerCase();
    const rules: [RegExp, string][] = [
      [/سيار|car|auto/, 'pi-car'],
      [/مكتب|office|شرك|محل|shop|store/, 'pi-building'],
      [/كنب|سجاد|موكيت|sofa|carpet|rug|ستائر|curtain/, 'pi-th-large'],
      [/مكيف|تكييف|ac\b|air ?con/, 'pi-sun'],
      [/خزان|tank|water|مياه/, 'pi-filter'],
      [/حشر|pest|مبيد/, 'pi-shield'],
      [/شق|بيت|منزل|فيلا|فلل|home|house|apartment|villa|flat/, 'pi-home'],
    ];
    return rules.find(([re]) => re.test(n))?.[1] ?? 'pi-sparkles';
  }

}
