import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CompanyStore } from '../../core/company.store';
import { PhonePipe } from '../../core/format';
import { SessionService } from '../../core/session.service';
import { socialLinks } from '../../core/socials';

/**
 * Bottom of every portal page: a deep-teal band that answers the hero (a wave on top), with the company,
 * the public pages, how to reach them, and the copyright line.
 */
@Component({
  selector: 'pt-public-footer',
  imports: [RouterLink, TranslatePipe, PhonePipe],
  styles: `
    :host { display: block; margin-top: 64px; position: relative; color: rgba(255, 255, 255, .82); }
    .wave { display: block; width: 100%; height: 56px; fill: var(--tide-deep); margin-bottom: -1px; }
    .band { background: linear-gradient(170deg, var(--tide-deep) 0%, #04454b 100%); position: relative; overflow: hidden; }
    /* Faint dot pattern in the corner, as in the hero. */
    .band::before { content: ''; position: absolute; inset-inline-end: 24px; top: 24px; width: 90px; height: 72px; pointer-events: none;
                    background-image: radial-gradient(rgba(255, 255, 255, .22) 2px, transparent 2.6px); background-size: 18px 18px; }
    .cols { position: relative; max-width: 1200px; margin: 0 auto; padding: 20px clamp(20px, 6vw, 120px) 28px;
            display: grid; gap: 28px 40px; grid-template-columns: 1fr; }
    @media (min-width: 760px) { .cols { grid-template-columns: 1.4fr 1fr 1.2fr; } }

    .brand { display: flex; align-items: center; gap: 12px; color: #fff; text-decoration: none; }
    .mark { width: 46px; height: 46px; border-radius: 50%; background: #fff; overflow: hidden; display: grid; place-items: center; flex: none; }
    .mark img { width: 100%; height: 100%; object-fit: contain; }
    .brand strong { font-size: 1.15rem; }
    .about { margin: 14px 0 0; line-height: 1.75; max-width: 36ch; font-size: .92rem; }

    h3 { color: #fff; font-size: .98rem; font-weight: 700; margin: 4px 0 12px; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 9px; }
    a { color: rgba(255, 255, 255, .82); text-decoration: none; }
    a:hover { color: #fff; }
    a:focus-visible { outline: 3px solid rgba(255, 255, 255, .6); outline-offset: 2px; border-radius: 6px; }
    li { display: flex; align-items: center; gap: 9px; font-size: .92rem; }
    li i { color: #7fd6db; font-size: .9rem; }

    .socials { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    .socials a { width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, .1); display: grid; place-items: center;
                 font-size: .78rem; font-weight: 700; color: #fff; }
    .socials a:hover { background: rgba(255, 255, 255, .2); }

    .bottom { border-top: 1px solid rgba(255, 255, 255, .14); }
    .bottom-in { max-width: 1200px; margin: 0 auto; padding: 14px clamp(20px, 6vw, 120px); display: flex; flex-wrap: wrap;
                 align-items: center; justify-content: space-between; gap: 8px 20px; font-size: .85rem; }
    .signin { display: inline-flex; align-items: center; gap: 6px; color: #fff; font-weight: 600; }
    .signin i { color: var(--sun); }

    /* Phones: leave room for the bar fixed at the bottom (booking bar or the signed-in tabs). */
    @media (max-width: 859px) { .bottom-in { padding-bottom: calc(var(--tabbar) + 18px + env(safe-area-inset-bottom)); } }
  `,
  template: `
    <svg class="wave" viewBox="0 0 1440 56" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,30 C240,6 460,0 720,22 C980,44 1200,50 1440,26 L1440,56 L0,56 Z" />
    </svg>
    <footer class="band">
      <div class="cols">
        <div>
          <a class="brand" [routerLink]="['/', slug()]">
            <span class="mark"><img [src]="company()?.logoUrl || 'brand/logo.svg'" alt="" /></span>
            <strong>{{ companyName() }}</strong>
          </a>
          <p class="about">{{ store.headline() || ('company.defaultHeadline' | translate) }}</p>
          @if (socials().length) {
            <div class="socials">
              @for (s of socials(); track s.key) {
                <a [href]="s.url" target="_blank" rel="noopener" [attr.aria-label]="s.label" [title]="s.label">
                  @if (s.icon) { <i class="pi" [class]="s.icon"></i> } @else { {{ s.short }} }
                </a>
              }
            </div>
          }
        </div>

        <nav [attr.aria-label]="'company.menu' | translate">
          <h3>{{ 'footer.pages' | translate }}</h3>
          <ul>
            <li><a [routerLink]="['/', slug()]" fragment="services">{{ 'company.services' | translate }}</a></li>
            <li><a [routerLink]="['/', slug()]" fragment="reviews">{{ 'company.reviews' | translate }}</a></li>
            <li><a [routerLink]="['/', slug()]" fragment="contact">{{ 'company.contact' | translate }}</a></li>
            <li><a [routerLink]="['/', slug()]" fragment="about">{{ 'company.aboutUs' | translate }}</a></li>
            @if (company()?.bookingOpen) {
              <li><a [routerLink]="['/', slug(), 'book']">{{ 'company.book' | translate }}</a></li>
            }
            @if (signedIn()) {
              <li><a [routerLink]="['/', slug(), 'bookings']">{{ 'shell.bookings' | translate }}</a></li>
            } @else {
              <li><a [routerLink]="['/', slug(), 'register']">{{ 'register.title' | translate }}</a></li>
            }
          </ul>
        </nav>

        @if (hasContact()) {
        <div>
          <h3>{{ 'company.contact' | translate }}</h3>
          <ul>
            @if (page().whatsapp) {
              <li><i class="pi pi-whatsapp"></i><a [href]="'https://wa.me/' + page().whatsapp!.replace('+', '')" target="_blank" rel="noopener">{{ page().whatsapp | phone }}</a></li>
            }
            @if (company()?.phone) {
              <li><i class="pi pi-phone"></i><a [href]="'tel:' + company()!.phone">{{ company()!.phone | phone }}</a></li>
            }
            @if (store.address()) {
              <li><i class="pi pi-map-marker"></i><span>{{ store.address() }}</span></li>
            }
            @if (store.hours()) {
              <li><i class="pi pi-clock"></i><span>{{ store.hours() }}</span></li>
            }
          </ul>
        </div>
        }
      </div>

      <div class="bottom">
        <div class="bottom-in">
          <span>© <span class="ltr tnum">{{ year }}</span> {{ companyName() }}. {{ 'footer.rights' | translate }}</span>
          @if (!signedIn()) {
            <a class="signin" [routerLink]="['/', slug(), 'login']"><i class="pi pi-shield" aria-hidden="true"></i>{{ 'company.signInHint' | translate }}</a>
          }
        </div>
      </div>
    </footer>
  `,
})
export class PublicFooter {
  protected readonly store = inject(CompanyStore);
  private readonly sessions = inject(SessionService);

  protected readonly slug = this.store.slug;
  protected readonly company = this.store.company;
  protected readonly companyName = this.store.name;
  protected readonly page = computed(() => this.company()?.page ?? {});
  protected readonly signedIn = computed(() => !!this.sessions.get(this.slug()));
  protected readonly year = new Date().getFullYear();

  protected readonly socials = computed(() => socialLinks(this.page()));
  protected readonly hasContact = computed(
    () => !!(this.page().whatsapp || this.company()?.phone || this.store.address() || this.store.hours()),
  );
}
