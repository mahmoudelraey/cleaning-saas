import { Component, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Tab, TabList, Tabs } from 'primeng/tabs';

import { AnalyticsQuery, DrillQuery } from '../analytics/analytics.api';
import { AnalyticsFilters, defaultQuery } from '../analytics/filter-bar';
import { OverviewTab } from '../analytics/overview.tab';
import { RecordsDrawer } from '../analytics/records-drawer';
import { RegionsTab } from '../analytics/regions.tab';
import { ServicesTab } from '../analytics/services.tab';
import { TeamTab } from '../analytics/team.tab';
import { TimeTab } from '../analytics/time.tab';
import { ExportMenu } from '../analytics/visuals';

type TabKey = 'overview' | 'services' | 'regions' | 'time' | 'team';
const TAB_KEY = 'fo.analytics.tab';

/**
 * Analytics & reports: the business-intelligence dashboard. One filter bar drives every section; each chart opens
 * the bookings or invoices behind it; the current view or a full monthly / yearly report exports to Excel or PDF.
 */
@Component({
  selector: 'app-reports',
  imports: [TranslatePipe, Tabs, TabList, Tab, AnalyticsFilters, OverviewTab, ServicesTab, RegionsTab, TimeTab, TeamTab, RecordsDrawer, ExportMenu],
  styles: `
    .tabs { margin-bottom: 1rem; }
    :host ::ng-deep .tabs .p-tablist-tab-list { background: transparent; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'analytics.title' | translate }}</h1>
        <p>{{ 'analytics.subtitle' | translate }} · <span class="muted">{{ 'analytics.basis' | translate }}</span></p>
      </div>
      <app-export-menu [query]="query()" />
    </div>

    <app-analytics-filters [(query)]="query" />

    <p-tabs class="tabs" [value]="tab()" (valueChange)="setTab($any($event))" [scrollable]="true">
      <p-tablist>
        <p-tab value="overview"><i class="pi pi-chart-line"></i> {{ 'analytics.tab.overview' | translate }}</p-tab>
        <p-tab value="services"><i class="pi pi-list-check"></i> {{ 'analytics.tab.services' | translate }}</p-tab>
        <p-tab value="regions"><i class="pi pi-map"></i> {{ 'analytics.tab.regions' | translate }}</p-tab>
        <p-tab value="time"><i class="pi pi-calendar"></i> {{ 'analytics.tab.time' | translate }}</p-tab>
        <p-tab value="team"><i class="pi pi-wrench"></i> {{ 'analytics.tab.team' | translate }}</p-tab>
      </p-tablist>
    </p-tabs>

    @switch (tab()) {
      @case ('overview') { <app-overview-tab [query]="query()" (drill)="drill.set($event)" /> }
      @case ('services') { <app-services-tab [query]="query()" (drill)="drill.set($event)" /> }
      @case ('regions') { <app-regions-tab [query]="query()" (drill)="drill.set($event)" (filter)="patch($event)" /> }
      @case ('time') { <app-time-tab [query]="query()" (drill)="drill.set($event)" /> }
      @case ('team') { <app-team-tab [query]="query()" /> }
    }

    <app-records-drawer [(drill)]="drill" />
  `,
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
