import { Component, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Tab, TabList, Tabs } from 'primeng/tabs';

import { AnalyticsQuery, DrillQuery } from '../analytics/analytics.api';
import { AnalyticsFilters, defaultQuery } from '../analytics/filter-bar/filter-bar';
import { OverviewTab } from '../analytics/overview/overview.tab';
import { RecordsDrawer } from '../analytics/records-drawer/records-drawer';
import { RegionsTab } from '../analytics/regions/regions.tab';
import { ServicesTab } from '../analytics/services/services.tab';
import { TeamTab } from '../analytics/team/team.tab';
import { TimeTab } from '../analytics/time/time.tab';
import { ExportMenu } from '../analytics/visuals/visuals';

type TabKey = 'overview' | 'services' | 'regions' | 'time' | 'team';
const TAB_KEY = 'fo.analytics.tab';

/**
 * Analytics & reports: the business-intelligence dashboard. One filter bar drives every section; each chart opens
 * the bookings or invoices behind it; the current view or a full monthly / yearly report exports to Excel or PDF.
 */
@Component({
  selector: 'app-reports',
  imports: [TranslatePipe, Tabs, TabList, Tab, AnalyticsFilters, OverviewTab, ServicesTab, RegionsTab, TimeTab, TeamTab, RecordsDrawer, ExportMenu],
  styleUrl: './reports.page.scss',
  templateUrl: './reports.page.html',
})
export class ReportsPage {
  protected readonly query = signal<AnalyticsQuery>(defaultQuery('thisMonth'));
  protected readonly tab = signal<TabKey>(readTab());
  protected readonly drill = signal<DrillQuery | null>(null);

  protected setTab(t: TabKey): void {
    this.tab.set(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* private mode: not remembered */
    }
  }

  protected patch(p: Partial<AnalyticsQuery>): void {
    this.query.update((q) => ({ ...q, ...p }));
  }
}

function readTab(): TabKey {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t === 'overview' || t === 'services' || t === 'regions' || t === 'time' || t === 'team') return t;
  } catch {
    /* ignore */
  }
  return 'overview';
}
