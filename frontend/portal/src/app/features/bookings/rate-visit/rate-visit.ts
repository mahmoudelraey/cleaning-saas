import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { MyReview } from '../../../core/api.types';
import { errorMessage } from '../../../core/errors';
import { PortalApi } from '../../../core/portal.api';
import { ToastService } from '../../../core/toast';

/** Rate a completed visit: five stars (a radio group) and an optional comment. Rating again replaces it. */
@Component({
  selector: 'pt-rate-visit',
  imports: [FormsModule, TranslatePipe],
  styleUrl: './rate-visit.scss',
  templateUrl: './rate-visit.html',
})
export class RateVisit {
  private readonly api = inject(PortalApi);
  private readonly toasts = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly slug = input.required<string>();
  readonly bookingId = input.required<string>();
  readonly review = input<MyReview | undefined>();
  readonly saved = output<MyReview>();

  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly rating = signal(0);
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected comment = '';

  protected edit(): void {
    this.rating.set(this.review()?.rating ?? 0);
    this.comment = this.review()?.comment ?? '';
    this.editing.set(true);
  }

  protected save(): void {
    this.busy.set(true);
    this.api.rate(this.slug(), this.bookingId(), this.rating(), this.comment.trim() || null).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.editing.set(false);
        this.saved.emit(r);
        this.toasts.show(this.translate.instant('rate.sent'));
      },
      error: (e) => {
        this.busy.set(false);
        this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }
}
