import { Component, input } from '@angular/core';

/** FieldOps logo: the map-pin mark, optionally with the "FieldOps" wordmark beside it. */
@Component({
  selector: 'app-brand-logo',
  styleUrl: './brand-logo.scss',
  templateUrl: './brand-logo.html',
})
export class BrandLogo {
  readonly size = input(48);
  readonly wordmark = input(true);
}
