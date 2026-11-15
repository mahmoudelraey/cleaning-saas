import { Component, DestroyRef, ElementRef, OnInit, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { GooglePlace } from '../../../core/api.types';
import { LanguageService } from '../../../core/language.service';
import { PortalApi } from '../../../core/portal.api';
import { Stars } from '../stars/stars';

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
  styleUrl: './google-reviews.scss',
  templateUrl: './google-reviews.html',
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
