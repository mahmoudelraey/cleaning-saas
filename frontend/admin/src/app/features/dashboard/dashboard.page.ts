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
  styleUrl: './dashboard.page.scss',
  templateUrl: './dashboard.page.html',
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
