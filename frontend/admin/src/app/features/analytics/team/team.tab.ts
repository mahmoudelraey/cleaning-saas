import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReportSummary } from '../../../core/api.types';
import { LanguageService } from '../../../core/i18n/language.service';
import { AnalyticsQuery } from '../analytics.api';
import { countText, sarCurrency } from '../charts';
import { loader } from '../load';
import { StateBlock } from '../widgets/widgets';

/** Technician performance for the period (the existing reports summary API). */
@Component({
  selector: 'app-team-tab',
  imports: [TranslatePipe, StateBlock],
  styleUrl: './team.tab.scss',
  templateUrl: './team.tab.html',
})
export class TeamTab {
  private readonly http = inject(HttpClient);
  private readonly lang = inject(LanguageService);

  readonly query = input.required<AnalyticsQuery>();
  /** The summary covers at most a year: longer ranges show the last 366 days. */
  private readonly range = computed(() => {
    const q = this.query();
    const to = new Date(q.to + 'T00:00:00');
    const min = new Date(to);
    min.setDate(min.getDate() - 365);
    const from = new Date(q.from + 'T00:00:00') < min ? min : new Date(q.from + 'T00:00:00');
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: iso(from), to: q.to };
  });
  protected readonly data = loader(this.range, (r) => this.http.get<ReportSummary>('/api/v1/reports/summary', { params: r }));

  protected money(h: number): string {
    return sarCurrency(h, this.lang.current());
  }

  protected count(n: number): string {
    return countText(n, this.lang.current());
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  protected share(v: number): number {
    const max = Math.max(1, ...(this.data.value().data?.technicians ?? []).map((t) => t.completedValueHalalas));
    return Math.max(2, Math.round((v / max) * 100));
  }
}
