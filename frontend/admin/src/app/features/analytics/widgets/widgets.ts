import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';

import { LanguageService } from '../../../core/i18n/language.service';
import { pctText } from '../charts';

/**
 * KPI card: label, value, change against the comparison period (green when it moves the right way, red when not;
 * `invert` for costs and cancellations, where going up is bad) and a one-line hint.
 */
@Component({
  selector: 'app-kpi',
  imports: [TranslatePipe],
  styleUrl: './widgets.kpi-card.scss',
  templateUrl: './widgets.kpi-card.html',
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
  styleUrl: './widgets.state-block.scss',
  templateUrl: './widgets.state-block.html',
})
export class StateBlock {
  readonly kind = input.required<'loading' | 'error' | 'empty'>();
  readonly message = input<string | null>(null);
  readonly retry = output<void>();
}
