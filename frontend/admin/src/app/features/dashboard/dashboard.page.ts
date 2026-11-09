import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { forkJoin } from 'rxjs';

import { Page, CustomerSummary, ReportSummary, ServiceOffering, Technician } from '../../core/api.types';
import { SarPipe } from '../../shared/format';
import { AuthService } from '../../core/auth/auth.service';
import { TenantService } from '../../core/tenant.service';

interface Step {
  key: string;
  done: boolean;
  link: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TranslatePipe, Button, SarPipe],
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-block-end: 1.25rem; }
    .stat { display: flex; align-items: center; gap: 1rem; }
    .stat i { font-size: 1.4rem; width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center;
      background: var(--p-primary-50); color: var(--p-primary-600); }
    .stat strong { font-size: 1.6rem; display: block; }
    a.stat { color: inherit; text-decoration: none; }
    .steps { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .5rem; }
    .steps li { display: flex; align-items: center; gap: .75rem; padding: .75rem 1rem; border: 1px solid var(--fo-border); border-radius: 10px; }
    .steps li.done { opacity: .6; }
    .steps li.done span { text-decoration: line-through; }
    .steps li i.pi-check-circle { color: var(--p-green-500); }
    .steps li a { margin-inline-start: auto; }
    .link-box { display: flex; gap: .5rem; align-items: center; margin-top: .75rem; flex-wrap: wrap; }
    .link-box code { background: var(--fo-bg); padding: .5rem .75rem; border-radius: 8px; direction: ltr; }
    .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; }
    @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
    h2 { margin: 0; font-size: 1.1rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'dashboard.hello' | translate: { name: auth.user()?.name } }}</h1>
        <p>{{ 'dashboard.subtitle' | translate }}</p>
      </div>
    </div>

    @if (auth.hasRole('TECHNICIAN')) {
      <div class="panel empty">
        <i class="pi pi-calendar"></i>
        {{ 'dashboard.technicianSoon' | translate }}
      </div>
    } @else {
      @if (month(); as m) {
        <div class="grid">
          <a class="panel stat" routerLink="/reports">
            <i class="pi pi-wallet"></i>
            <div><strong class="ltr">{{ m.revenue.collectedHalalas | sar }}</strong><span class="muted">{{ 'dashboard.collectedMonth' | translate }}</span></div>
          </a>
          <a class="panel stat" routerLink="/invoices">
            <i class="pi pi-file"></i>
            <div><strong class="ltr">{{ m.revenue.outstandingHalalas | sar }}</strong><span class="muted">{{ 'reports.outstanding' | translate }}</span></div>
          </a>
          <a class="panel stat" routerLink="/bookings">
            <i class="pi pi-check-circle"></i>
            <div><strong>{{ m.bookings.completed }}</strong><span class="muted">{{ 'dashboard.completedMonth' | translate }}</span></div>
          </a>
        </div>
      }
      <div class="grid">
        <div class="panel stat">
          <i class="pi pi-users"></i>
          <div><strong>{{ customers() }}</strong><span class="muted">{{ 'nav.customers' | translate }}</span></div>
        </div>
        <div class="panel stat">
          <i class="pi pi-list-check"></i>
          <div><strong>{{ services() }}</strong><span class="muted">{{ 'nav.services' | translate }}</span></div>
        </div>
        <div class="panel stat">
          <i class="pi pi-wrench"></i>
          <div>
            <strong>{{ technicians() }}<small class="muted"> / {{ tenants.tenant()?.plan?.maxTechnicians }}</small></strong>
            <span class="muted">{{ 'nav.technicians' | translate }}</span>
          </div>
        </div>
      </div>

      <div class="two">
        <div class="panel">
          <h2>{{ 'dashboard.setupTitle' | translate }}</h2>
          <ul class="steps">
            @for (s of steps(); track s.key) {
              <li [class.done]="s.done">
                <i [class]="s.done ? 'pi pi-check-circle' : 'pi pi-circle'"></i>
                <span>{{ 'dashboard.steps.' + s.key | translate }}</span>
                @if (!s.done) {
                  <a [routerLink]="s.link"><p-button size="small" [text]="true" [label]="'common.start' | translate" /></a>
                }
              </li>
            }
          </ul>
        </div>

        <div class="panel">
          <h2>{{ 'dashboard.bookingLink' | translate }}</h2>
          <p class="muted">{{ 'dashboard.bookingLinkHint' | translate }}</p>
          <div class="link-box">
            <code>{{ tenants.portalUrl() }}</code>
            <p-button icon="pi pi-copy" [text]="true" (onClick)="copyLink()" [ariaLabel]="'common.copy' | translate" />
            <a [href]="tenants.portalUrl()" target="_blank" rel="noopener"><p-button icon="pi pi-external-link" [text]="true" [ariaLabel]="'common.open' | translate" /></a>
          </div>
        </div>
      </div>
    }
  `,
})
export class DashboardPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly tenants = inject(TenantService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly customers = signal(0);
  protected readonly services = signal(0);
  protected readonly technicians = signal(0);
  protected readonly month = signal<ReportSummary | null>(null);

  protected readonly steps = computed<Step[]>(() => [
    { key: 'services', done: this.services() > 0, link: '/services' },
    { key: 'technicians', done: this.technicians() > 0, link: '/technicians' },
    { key: 'customers', done: this.customers() > 0, link: '/customers' },
    { key: 'share', done: false, link: '/settings' },
  ]);

  ngOnInit(): void {
    if (this.auth.hasRole('TECHNICIAN')) {
      void this.router.navigate(['/today']);
      return;
    }
    if (this.auth.canSee('REPORTS')) {
      // Monthly figures come from reports, which not every plan includes (and coordinators need the Reports screen).
      this.tenants.ensureLoaded().subscribe({
        next: () => {
          if (!this.tenants.has('reports')) {
            return;
          }
          const now = new Date();
          const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
          this.http
            .get<ReportSummary>('/api/v1/reports/summary', { params: { from: d(new Date(now.getFullYear(), now.getMonth(), 1)), to: d(new Date(now.getFullYear(), now.getMonth() + 1, 0)) } })
            .subscribe({ next: (r) => this.month.set(r), error: () => {} });
        },
        error: () => {},
      });
    }
    forkJoin({
      customers: this.http.get<Page<CustomerSummary>>('/api/v1/customers', { params: { size: 1 } }),
      services: this.http.get<ServiceOffering[]>('/api/v1/services', { params: { activeOnly: true } }),
      technicians: this.http.get<Technician[]>('/api/v1/technicians'),
    }).subscribe({
      next: (r) => {
        this.customers.set(r.customers.total);
        this.services.set(r.services.length);
        this.technicians.set(r.technicians.filter((t) => t.active).length);
      },
      error: () => {},
    });
  }

  copyLink(): void {
    void navigator.clipboard?.writeText(this.tenants.portalUrl()).then(() =>
      this.messages.add({ severity: 'success', summary: this.translate.instant('common.copied') }),
    );
  }
}
