import { HttpClient } from '@angular/common/http';
import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';

import { errorMessage } from '../core/http/api-error';
import { STRONG_PASSWORD } from '../features/auth/change-password.page';

/**
 * Owner sets a temporary password for a staff member or technician. The person is signed out everywhere
 * and must choose their own password at next sign-in. The password is shown so the owner can send it.
 */
@Component({
  selector: 'app-reset-password-dialog',
  imports: [FormsModule, TranslatePipe, Button, Dialog, InputText],
  styles: `
    .row { display: flex; gap: .5rem; }
    .row input { flex: 1; direction: ltr; font-family: ui-monospace, monospace; }
    .note { color: var(--fo-muted); font-size: .88rem; margin: 0 0 1rem; }
  `,
  template: `
    <p-dialog [header]="'password.resetTitle' | translate: { name: name() }" [(visible)]="visible" [modal]="true"
              [style]="{ width: '440px', maxWidth: '95vw' }" [draggable]="false" (onShow)="generate()">
      <p class="note">{{ 'password.resetBody' | translate }}</p>
      <div class="field">
        <label for="rp-pass">{{ 'password.temporary' | translate }}</label>
        <div class="row">
          <input pInputText id="rp-pass" [(ngModel)]="password" maxlength="100" autocomplete="off" />
          <p-button icon="pi pi-refresh" [text]="true" (onClick)="generate()" [ariaLabel]="'password.generate' | translate" />
          <p-button icon="pi pi-copy" [text]="true" (onClick)="copy()" [ariaLabel]="'common.copy' | translate" />
        </div>
        <small class="hint">{{ 'password.rule' | translate }}</small>
      </div>
      <div class="dialog-actions">
        <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
        <p-button [label]="'password.reset' | translate" icon="pi pi-key" [disabled]="!valid()" [loading]="saving()" (onClick)="save()" />
      </div>
    </p-dialog>
  `,
})
export class ResetPasswordDialog {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  readonly visible = model(false);
  readonly name = input('');
  /** e.g. /api/v1/technicians/{id}/password or /api/v1/users/{id}/password */
  readonly url = input.required<string>();
  readonly done = output<void>();

  protected password = '';
  protected readonly saving = signal(false);

  valid(): boolean {
    return STRONG_PASSWORD.test(this.password);
  }

  /** Easy to read out on the phone: no 0/O or 1/l look-alikes. */
  generate(): void {
    const letters = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
    let p = '';
    for (let i = 0; i < 5; i++) p += pick(letters);
    for (let i = 0; i < 4; i++) p += pick(digits);
    this.password = p.charAt(0).toUpperCase() + p.slice(1);
  }

  copy(): void {
    void navigator.clipboard?.writeText(this.password).then(() =>
      this.messages.add({ severity: 'success', summary: this.translate.instant('common.copied') }),
    );
  }

  save(): void {
    this.saving.set(true);
    this.http.post(this.url(), { password: this.password }).subscribe({
      next: () => {
        this.saving.set(false);
        this.visible.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('password.resetDone') });
        this.done.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }
}
