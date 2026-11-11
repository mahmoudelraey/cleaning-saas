import { Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Service } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { SarPipe } from '../../core/format';
import { defaultServiceImage, serviceIcon } from '../../core/service-image';
import { ServiceTextPipe } from '../../core/service-names';

/** A service as a photo card (company page and the all-services page). */
@Component({
  selector: 'pt-service-card',
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, SarPipe, ServiceTextPipe],
  styleUrl: './service-card.scss',
  template: `
    @let s = service();
    <!-- The whole card opens the booking page with this service (when the company takes bookings). -->
    @if (store.company()?.bookingOpen) {
      <a class="svc-card clickable" [routerLink]="['/', store.slug(), 'book']" [queryParams]="{ service: s.id }"
         [attr.aria-label]="('company.bookService' | translate) + ': ' + (s | svc)">
        <ng-container *ngTemplateOutlet="body" />
      </a>
    } @else {
      <article class="svc-card"><ng-container *ngTemplateOutlet="body" /></article>
    }

    <ng-template #body>
      <div class="svc-media">
        <img [src]="s.imageUrl || fallback()" [alt]="s | svc" loading="lazy" (error)="imageFailed($event)" />
        <span class="svc-ico"><i class="pi" [class]="icon()" aria-hidden="true"></i></span>
      </div>
      <div class="svc-body">
        <h3>{{ s | svc }}</h3>
        @if (s | svc: 'description'; as d) { <p class="svc-desc">{{ d }}</p> }
      </div>
      <footer class="svc-foot">
        <span class="from">
          {{ 'company.startsFrom' | translate }}
          <strong class="ltr tnum">{{ s.basePriceHalalas | sar }}</strong>
          @if (s.pricingType !== 'FIXED') { <em>/ {{ 'book.unit.' + s.pricingType | translate }}</em> }
        </span>
        @if (store.company()?.bookingOpen) {
          <span class="svc-go" aria-hidden="true"><i class="pi pi-arrow-left rtl-flip"></i></span>
        }
      </footer>
    </ng-template>
  `,
})
export class ServiceCard {
  protected readonly store = inject(CompanyStore);
  readonly service = input.required<Service>();

  /** The default picture chosen from the service's name (see defaultServiceImage). */
  protected readonly fallback = computed(() => defaultServiceImage(this.service().name, this.service().nameEn));

  /** A fitting icon from the service's name. */
  protected readonly icon = computed(() => serviceIcon(this.service().name, this.service().nameEn));

  /** An uploaded photo that can't be loaded falls back to the default picture (once). */
  protected imageFailed(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (!img.src.endsWith(this.fallback())) img.src = this.fallback();
  }
}
