import { Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Service } from '../../../core/api.types';
import { CompanyStore } from '../../../core/company.store';
import { PortalApi } from '../../../core/portal.api';
import { ServiceCard } from '../service-card/service-card';

/**
 * All of the company's services at {portal}/{slug}/services: a search box (Arabic or English name and
 * description) and pages of 9 cards (three per row). The search and the page live in the address (?q=…&page=…),
 * so the back button and shared links keep them.
 */
@Component({
  selector: 'pt-services-page',
  imports: [RouterLink, TranslatePipe, ServiceCard],
  styleUrl: './services.page.scss',
  templateUrl: './services.page.html',
})
export class ServicesPage {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  /** Cards per page: three full rows of three. */
  private readonly pageSize = 9;

  protected readonly services = signal<Service[] | null>(null);
  protected readonly query = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  private readonly requestedPage = signal(Number(this.route.snapshot.queryParamMap.get('page')) || 1);

  /** Matches in the Arabic or English name or description; ignores case, extra spaces and Arabic letter forms. */
  protected readonly filtered = computed(() => {
    const list = this.services() ?? [];
    const words = norm(this.query()).split(' ').filter(Boolean);
    if (!words.length) return list;
    return list.filter((s) => {
      const text = norm(`${s.name} ${s.nameEn ?? ''} ${s.description ?? ''} ${s.descriptionEn ?? ''}`);
      return words.every((w) => text.includes(w));
    });
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  /** The page asked for, kept inside the pages there are. */
  protected readonly page = computed(() => Math.min(Math.max(1, this.requestedPage()), this.pageCount()));
  protected readonly pageItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  /** Page numbers to show: the first, the last and two around the current one; 0 stands for "…". */
  protected readonly pageNumbers = computed(() => {
    const n = this.pageCount();
    const cur = this.page();
    const out: number[] = [];
    for (let p = 1; p <= n; p++) {
      if (p === 1 || p === n || Math.abs(p - cur) <= 1) out.push(p);
      else if (out.at(-1) !== 0) out.push(0);
    }
    return out;
  });

  constructor() {
    this.api.services(this.store.slug()).subscribe({
      next: (s) => this.services.set(s),
      error: () => this.services.set([]),
    });
  }

  protected search(value: string): void {
    this.query.set(value);
    this.requestedPage.set(1);
    this.syncUrl();
  }

  protected goTo(p: number): void {
    this.requestedPage.set(p);
    this.syncUrl();
    this.document.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Keep ?q and ?page in the address without adding a history entry per keystroke. */
  private syncUrl(): void {
    const q = this.query().trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null, page: this.page() > 1 ? this.page() : null },
      replaceUrl: true,
    });
  }
}

/** Lower case, single spaces, and the Arabic letter forms people type interchangeably (أ إ آ ا، ة ه، ى ي). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}
