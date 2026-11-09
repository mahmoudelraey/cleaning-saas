import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';

import { LanguageService } from '../../core/i18n/language.service';
import { pctText } from './charts';

/**
 * KPI card: label, value, change against the comparison period (green when it moves the right way, red when not;
 * `invert` for costs and cancellations, where going up is bad) and a one-line hint.
 */
@Component({
  selector: 'app-kpi',
  imports: [TranslatePipe],
  styles: `
    :host { display: block; }
    .kpi { display: grid; gap: .3rem; height: 100%; position: relative; }
    .kpi.clickable { cursor: pointer; transition: border-color .15s, box-shadow .15s; }
    .kpi.clickable:hover, .kpi.clickable:focus-visible { border-color: var(--p-primary-300); box-shadow: 0 2px 10px rgba(13, 148, 136, .08); outline: none; }
    .label { color: var(--fo-muted); font-size: .85rem; display: flex; align-items: center; gap: .4rem; }
    .label i { color: var(--p-primary-500); font-size: .9rem; }
    .value { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .value.neg { color: #dc2626; }
    .meta { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; font-size: .8rem; color: var(--fo-muted); }
    .delta { display: inline-flex; align-items: center; gap: .2rem; font-weight: 600; padding: .05rem .4rem; border-radius: 999px; direction: ltr; }
    .delta.up { color: #15803d; background: #dcfce7; }
    .delta.down { color: #b91c1c; background: #fee2e2; }
    .delta.flat { color: var(--fo-muted); background: #f1f5f9; }
    .locked { color: var(--fo-muted); font-size: .8rem; }
  `,
  template: `
    <div class="panel kpi" [class.clickable]="clickable()" [attr.tabindex]="clickable() ? 0 : null"
         [attr.role]="clickable() ? 'button' : null" (click)="clickable() && pick.emit()" (keydown.enter)="clickable() && pick.emit()">
      <span class="label">@if (icon()) {<i [class]="icon()"></i>}{{ label() }}</span>
      @if (value() !== null) {
        <strong class="value" [class.neg]="negative()"><span class="ltr">{{ value() }}</span></strong>
      } @else {
        <strong class="value">—</strong>
      }
      <span class="meta">
        @if (delta() !== null) {
          <span class="delta" [class]="tone()" [attr.aria-label]="'analytics.vsPrevious' | translate">
            <i class="pi" [class.pi-arrow-up]="(delta() ?? 0) > 0" [class.pi-arrow-down]="(delta() ?? 0) < 0" [class.pi-minus]="delta() === 0" style="font-size: .65rem"></i>
            {{ deltaText() }}
          </span>
        }
        @if (hint()) {
          <span>{{ hint() }}</span>
        }
      </span>
    </div>
  `,
})
export class KpiCard {
  private readonly lang = inject(LanguageService);

  readonly label = input.required<string>();
  readonly value = input<string | null>(null);
  readonly delta = input<number | null>(null);
  readonly invert = input(false);
  readonly negative = input(false);
  readonly hint = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly clickable = input(false);
  readonly pick = output<void>();

  protected readonly deltaText = computed(() => pctText(Math.abs(this.delta() ?? 0), this.lang.current()));
  protected readonly tone = computed(() => {
    const d = this.delta() ?? 0;
    if (Math.abs(d) < 0.0005) return 'delta flat';
    const good = this.invert() ? d < 0 : d > 0;
    return good ? 'delta up' : 'delta down';
  });
}

/** Loading, error (with retry) and empty states for a dashboard section. */
@Component({
  selector: 'app-state',
  imports: [TranslatePipe, Button],
  styles: `
    .state { text-align: center; padding: 2.5rem 1rem; color: var(--fo-muted); display: grid; gap: .6rem; justify-items: center; }
    .state i { font-size: 1.8rem; opacity: .6; }
    .skeleton { display: grid; gap: .75rem; padding: .5rem 0; }
    .bar { height: 14px; border-radius: 6px; background: linear-gradient(90deg, #eef2f6 25%, #f8fafc 50%, #eef2f6 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
    @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { .bar { animation: none; } }
  `,
  template: `
    @switch (kind()) {
      @case ('loading') {
        <div class="skeleton" aria-busy="true" [attr.aria-label]="'analytics.loading' | translate">
          <div class="bar" style="width: 60%"></div><div class="bar" style="width: 90%"></div><div class="bar" style="width: 75%"></div><div class="bar" style="width: 40%"></div>
        </div>
      }
      @case ('error') {
        <div class="state" role="alert">
          <i class="pi pi-exclamation-triangle"></i>
          <span>{{ message() || ('analytics.loadFailed' | translate) }}</span>
          <p-button size="small" [outlined]="true" icon="pi pi-refresh" [label]="'analytics.retry' | translate" (onClick)="retry.emit()" />
        </div>
      }
      @case ('empty') {
        <div class="state"><i class="pi pi-chart-line"></i><span>{{ message() || ('analytics.noData' | translate) }}</span></div>
      }
    }
  `,
})
export class StateBlock {
  readonly kind = input.required<'loading' | 'error' | 'empty'>();
  readonly message = input<string | null>(null);
  readonly retry = output<void>();
}
