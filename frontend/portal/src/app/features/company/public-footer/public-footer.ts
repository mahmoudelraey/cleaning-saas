import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CompanyStore } from '../../../core/company.store';
import { PhonePipe } from '../../../core/format';
import { SessionService } from '../../../core/session.service';
import { socialLinks } from '../../../core/socials';

/**
 * Bottom of every portal page: a deep-teal band that answers the hero (a wave on top), with the company,
 * the public pages, how to reach them, and the copyright line.
 */
@Component({
  selector: 'pt-public-footer',
  imports: [RouterLink, TranslatePipe, PhonePipe],
  styleUrl: './public-footer.scss',
  templateUrl: './public-footer.html',
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
