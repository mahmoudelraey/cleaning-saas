import { Component, DestroyRef, ElementRef, OnInit, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { GooglePlace } from '../../core/api.types';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { Stars } from './stars';

/**
 * The company's rating and reviews from Google Maps, fetched live when the section scrolls into view (each fetch
 * is billed by Google, and Google's terms do not allow storing them).
 *
 * Google's display rules, all kept here: each review credits its author (photo, name, profile link) and links to
 * the review on Google Maps; the block is labelled as Google Maps content with the Google logo; the reviews are
 * shown as Google returns them (Google picks and orders them, at most five), and the page says so.
 * The logo file is Google's own: download it from Google's attribution guidelines into
 * public/google/google_logo.png. Until it is there, the text "Google Maps" is shown instead.
 */
@Component({
  selector: 'pt-google-reviews',
  imports: [TranslatePipe, Stars],
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
    .big { font-size: 2.6rem; font-weight: 700; line-height: 1; direction: ltr; }
    .side { display: flex; flex-direction: column; gap: 4px; font-size: .9rem; }
    .attrib { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 6px; font-size: .82rem; color: var(--ink-3); }
    .attrib img { height: 18px; width: auto; }
    .attrib .gm { font-weight: 600; color: var(--ink-2); }
    .list { list-style: none; padding: 2px 16px 14px; margin: 0 -16px; display: grid; grid-auto-flow: column;
            grid-auto-columns: minmax(270px, 84%); gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; }
    @media (min-width: 720px) { .list { grid-auto-columns: calc((100% - 24px) / 2.15); } }
    .card { scroll-snap-align: start; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg);
            padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
    .who { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; min-width: 0; }
    .who img, .who .ph { width: 36px; height: 36px; border-radius: 50%; flex: none; object-fit: cover; background: var(--foam); }
    .who .ph { display: grid; place-items: center; color: var(--tide-deep); font-weight: 700; }
    .who strong { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who small { color: var(--ink-3); font-size: .8rem; }
    .text { margin: 0; line-height: 1.7; flex: 1; display: -webkit-box; -webkit-line-clamp: 7; -webkit-box-orient: vertical; overflow: hidden; }
    .card footer { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .8rem; color: var(--ink-3); align-items: center; }
    .card footer a { color: var(--tide); }
    .note { font-size: .8rem; color: var(--ink-3); margin: 6px 0 0; }
    .all { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; font-weight: 600; }
    .state { color: var(--ink-3); font-size: .9rem; padding: 12px 0; }
  `,
  template: `
    @if (place(); as p) {
      <div class="head">
        @if (p.rating) {
          <span class="big tnum">{{ p.rating.toFixed(1) }}</span>
          <span class="side">
            <pt-stars [value]="p.rating" style="--star-size: 1.1rem" />
            @if (p.count) { <span class="muted">{{ 'google.count' | translate: { n: p.count } }}</span> }
          </span>
        }
        <span class="attrib">
          {{ 'google.from' | translate }}
          @if (logoOk()) {
            <img src="google/google_logo.png" alt="Google" (error)="logoOk.set(false)" />
          }
          <span class="gm">Google Maps</span>
        </span>
      </div>

      @if (p.reviews.length) {
        <ul class="list">
          @for (r of p.reviews; track $index) {
            <li class="card">
              <a class="who" [href]="r.author?.uri" target="_blank" rel="noopener nofollow">
                @if (r.author?.photoUri) {
                  <img [src]="r.author!.photoUri" alt="" referrerpolicy="no-referrer" loading="lazy" />
                } @else {
                  <span class="ph">{{ (r.author?.name || '?').charAt(0) }}</span>
                }
                <span style="min-width:0">
                  <strong>{{ r.author?.name }}</strong>
                  @if (r.relativeTime) { <small>{{ r.relativeTime }}</small> }
                </span>
              </a>
              <pt-stars [value]="r.rating" />
              @if (r.text) { <p class="text" dir="auto">{{ r.text }}</p> }
              <footer>
                @if (r.translated) { <span>{{ 'google.translated' | translate }}</span> }
                @if (r.googleMapsUri) {
                  <a [href]="r.googleMapsUri" target="_blank" rel="noopener nofollow">{{ 'google.viewReview' | translate }}</a>
                }
                @if (r.flagUri) {
                  <a [href]="r.flagUri" target="_blank" rel="noopener nofollow">{{ 'google.report' | translate }}</a>
                }
              </footer>
            </li>
          }
        </ul>
        <p class="note">{{ 'google.ordering' | translate }}</p>
      }
      @if (p.googleMapsUri) {
        <a class="all" [href]="p.googleMapsUri" target="_blank" rel="noopener">
          <i class="pi pi-external-link"></i>{{ 'google.seeAll' | translate }}
        </a>
      }
    } @else if (failed()) {
      <p class="state">{{ 'google.unavailable' | translate }}</p>
    } @else {
      <div class="spinner" aria-hidden="true"></div>
    }
  `,
})
export class GoogleReviews implements OnInit {
  private readonly api = inject(PortalApi);
  private readonly lang = inject(LanguageService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly slug = input.required<string>();

  protected readonly place = signal<GooglePlace | null>(null);
  protected readonly failed = signal(false);
  protected readonly logoOk = signal(true);
  private readonly visible = signal(false);

  constructor() {
    // Load once visible, and again when the language changes (Google translates the reviews).
    effect(() => {
      const lang = this.lang.current();
      if (!this.visible()) return;
      this.failed.set(false);
      this.api.googleReviews(this.slug(), lang).subscribe({
        next: (p) => this.place.set(p),
        error: () => this.failed.set(true),
      });
    });
  }

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.visible.set(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.visible.set(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => io.disconnect());
  }
}
