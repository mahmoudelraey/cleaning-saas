import { Component, input, model, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Dialog } from 'primeng/dialog';

/**
 * The app's dialog frame: round icon, title and subtitle, close button; the body scrolls between a fixed header and
 * footer. Attached to <body> (above the top bar).
 *
 * Content goes inside; mark the parts with the global classes:
 * <pre>
 * <app-dialog [(visible)]="open" [title]="'x.title' | translate" icon="pi pi-user">
 *   <form class="fo-dlg-form" (ngSubmit)="save()">
 *     <div class="fo-dlg-body"> <div class="fo-card form-grid">…</div> </div>
 *     <div class="fo-dlg-foot"> …buttons… </div>
 *   </form>
 * </app-dialog>
 * </pre>
 */
@Component({
  selector: 'app-dialog',
  imports: [Dialog, TranslatePipe],
  templateUrl: './dialog.html',
})
export class AppDialog {
  readonly visible = model(false);
  readonly title = input<string>('');
  readonly subtitle = input<string | null | undefined>(null);
  /** PrimeIcons class, e.g. "pi pi-user". */
  readonly icon = input<string>('pi pi-file-edit');
  readonly width = input<string>('720px');
  /** Closing by clicking outside (off by default for forms). */
  readonly dismissable = input(false);
  readonly hide = output<void>();
}
