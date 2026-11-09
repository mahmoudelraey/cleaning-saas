import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { MyReview } from '../../core/api.types';
import { errorMessage } from '../../core/errors';
import { PortalApi } from '../../core/portal.api';
import { ToastService } from '../../core/toast';

/** Rate a completed visit: five stars (a radio group) and an optional comment. Rating again replaces it. */
@Component({
  selector: 'pt-rate-visit',
  imports: [FormsModule, TranslatePipe],
  styles: `
    .stars { display: flex; gap: 6px; direction: ltr; justify-content: flex-start; margin: 4px 0 12px; }
    :host-context([dir='rtl']) .stars { justify-content: flex-end; }
    .star { border: 0; background: none; padding: 4px; cursor: pointer; color: var(--line); font-size: 2rem; line-height: 1;
            border-radius: 10px; transition: transform .1s; }
    .star.on { color: var(--sun); }
    .star:active { transform: scale(.92); }
    .star:focus-visible { outline: 3px solid color-mix(in srgb, var(--tide) 45%, transparent); }
    .word { color: var(--ink-2); font-size: .9rem; min-height: 1.4em; margin: -6px 0 10px; }
    textarea { width: 100%; min-height: 84px; resize: vertical; }
    .done { display: flex; align-items: flex-start; gap: 12px; }
    .done .shown { color: var(--sun); font-size: 1.1rem; direction: ltr; white-space: nowrap; }
    .done p { margin: 4px 0 0; }
    .note { color: var(--ink-3); font-size: .84rem; margin: 8px 0 0; }
    .actions { display: flex; gap: 10px; margin-top: 12px; }
  `,
  template: `
    <div class="sheet">
      @if (review() && !editing()) {
        <div class="done">
          <span class="shown" [attr.aria-label]="'rate.yourRating' | translate: { n: review()!.rating }">
            @for (n of five; track n) { <i class="pi" [class.pi-star-fill]="n <= review()!.rating" [class.pi-star]="n > review()!.rating"></i> }
          </span>
          <div style="flex:1">
            <strong>{{ 'rate.thanks' | translate }}</strong>
            @if (review()!.comment) { <p class="muted">{{ review()!.comment }}</p> }
            <p class="note">{{ (review()!.published ? 'rate.published' : 'rate.private') | translate }}</p>
          </div>
          <button type="button" class="link-btn" (click)="edit()">{{ 'rate.edit' | translate }}</button>
        </div>
      } @else {
        <strong id="rate-q">{{ 'rate.question' | translate }}</strong>
        <div class="stars" role="radiogroup" aria-labelledby="rate-q">
          @for (n of five; track n) {
            <button type="button" class="star" role="radio" [attr.aria-checked]="rating() === n"
                    [attr.aria-label]="'rate.stars' | translate: { n: n }" [class.on]="n <= rating()" (click)="rating.set(n)">
              <i class="pi" [class.pi-star-fill]="n <= rating()" [class.pi-star]="n > rating()"></i>
            </button>
          }
        </div>
        <div class="word">@if (rating()) { {{ 'rate.word.' + rating() | translate }} }</div>
        <textarea class="input" [(ngModel)]="comment" maxlength="1000" [placeholder]="'rate.commentPlaceholder' | translate"
                  [attr.aria-label]="'rate.comment' | translate"></textarea>
        <p class="note">{{ 'rate.privacy' | translate }}</p>
        <div class="actions">
          <button type="button" class="btn btn-primary" [disabled]="!rating() || busy()" (click)="save()">{{ 'rate.send' | translate }}</button>
          @if (review()) { <button type="button" class="btn btn-quiet" (click)="editing.set(false)">{{ 'rate.cancel' | translate }}</button> }
        </div>
      }
    </div>
  `,
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
