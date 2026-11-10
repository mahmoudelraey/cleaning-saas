import { Component, input } from '@angular/core';

/** FieldOps logo: the map-pin mark, optionally with the "FieldOps" wordmark beside it. */
@Component({
  selector: 'app-brand-logo',
  styles: `
    :host { display: inline-flex; align-items: center; gap: 0.6rem; direction: ltr; }
    img { display: block; flex: none; }
    .word { font-weight: 700; letter-spacing: -0.02em; line-height: 1; color: #0f2a2e; }
    .word .ops { color: var(--p-primary-600); }
    :host(.light) .word { color: #fff; }
    :host(.light) .word .ops { color: #5eead4; }
  `,
  template: `
    <img src="brand/logo-mark.svg" alt="FieldOps" [style.width.px]="size()" [style.height.px]="size()" />
    @if (wordmark()) {
      <span class="word" [style.font-size.px]="size() * 0.62"><span>Field</span><span class="ops">Ops</span></span>
    }
  `,
})
export class BrandLogo {
  readonly size = input(48);
  readonly wordmark = input(true);
}
