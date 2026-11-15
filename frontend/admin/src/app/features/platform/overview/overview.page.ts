import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Tag } from 'primeng/tag';

import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { SarPipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { PlatformApi, PlatformOverview, daysUntil } from '../platform.api';

/** Platform console home: how many companies are on trial, paying, overdue or blocked, and what needs action. */
@Component({
  selector: 'app-platform-overview',
  imports: [TranslatePipe, RouterLink, Tag, SarPipe, LocalDatePipe],
  styleUrl: './overview.page.scss',
  templateUrl: './overview.page.html',
})
export class PlatformOverviewPage {
  private readonly api = inject(PlatformApi);
  private readonly translate = inject(TranslateService);
  protected readonly lang = inject(LanguageService);

  protected readonly data = signal<PlatformOverview | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.overview().subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(errorMessage(e, this.translate)),
    });
  }

  protected days(iso: string | null): number {
    return daysUntil(iso) ?? 0;
  }

  protected share(n: number): number {
    const max = Math.max(1, ...(this.data()?.byPlan ?? []).map((p) => p.companies));
    return Math.max(3, Math.round((n / max) * 100));
  }
}
