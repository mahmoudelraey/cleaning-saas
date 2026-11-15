import { Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Drawer } from 'primeng/drawer';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';

import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { SarPipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { AnalyticsApi, DrillQuery, RecordPage } from '../analytics.api';
import { STATUS_COLORS } from '../charts';
import { StateBlock } from '../widgets/widgets';

const PAGE = 25;

/** Side panel with the bookings or invoices behind a chart point (drill-down). */
@Component({
  selector: 'app-records-drawer',
  imports: [Drawer, TableModule, Tag, RouterLink, TranslatePipe, SarPipe, LocalDatePipe, StateBlock],
  styleUrl: './records-drawer.scss',
  templateUrl: './records-drawer.html',
})
export class RecordsDrawer {
  private readonly api = inject(AnalyticsApi);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  readonly drill = model<DrillQuery | null>(null);

  protected readonly pageSize = PAGE;
  protected readonly page = signal<RecordPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly first = signal(0);
  protected readonly en = computed(() => this.lang.current() === 'en');

  constructor() {
    effect(() => {
      if (this.drill()) {
        this.page.set(null);
        this.first.set(0);
        this.load(0);
      }
    });
  }

  protected onLazy(e: TableLazyLoadEvent): void {
    const first = e.first ?? 0;
    if (first !== this.first()) {
      this.first.set(first);
      this.load(first);
    }
  }

  load(first: number): void {
    const d = this.drill();
    if (!d) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.records(d, this.lang.current(), Math.floor(first / PAGE), PAGE).subscribe({
      next: (p) => {
        this.page.set(p);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e, this.translate));
        this.loading.set(false);
      },
    });
  }

  protected color(status: string): string {
    return STATUS_COLORS[status] ?? '#94a3b8';
  }
}
