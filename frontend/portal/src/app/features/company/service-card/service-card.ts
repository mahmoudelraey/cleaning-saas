import { Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Service } from '../../../core/api.types';
import { CompanyStore } from '../../../core/company.store';
import { SarPipe } from '../../../core/format';
import { defaultServiceImage, serviceIcon } from '../../../core/service-image';
import { ServiceTextPipe } from '../../../core/service-names';

/** A service as a photo card (company page and the all-services page). */
@Component({
  selector: 'pt-service-card',
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, SarPipe, ServiceTextPipe],
  styleUrl: './service-card.scss',
  templateUrl: './service-card.html',
})
export class ServiceCard {
  protected readonly store = inject(CompanyStore);
  readonly service = input.required<Service>();

  /** The default picture chosen from the service's name (see defaultServiceImage). */
  protected readonly fallback = computed(() => defaultServiceImage(this.service().name, this.service().nameEn));

  /** "Starts from": the cheapest option when the service has options, otherwise its price. */
  protected readonly fromPrice = computed(() => {
    const s = this.service();
    return s.options?.length ? Math.min(...s.options.map((o) => o.priceHalalas)) : s.basePriceHalalas;
  });

  /** A fitting icon from the service's name. */
  protected readonly icon = computed(() => serviceIcon(this.service().name, this.service().nameEn));

  /** An uploaded photo that can't be loaded falls back to the default picture (once). */
  protected imageFailed(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (!img.src.endsWith(this.fallback())) img.src = this.fallback();
  }
}
