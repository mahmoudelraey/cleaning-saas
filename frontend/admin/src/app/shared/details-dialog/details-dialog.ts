import { Component, input, model, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';

import { AuditInfo } from '../../core/api.types';
import { PhonePipe, SarPipe } from '../format';
import { LocalDatePipe } from '../local-date.pipe';
import { AppDialog } from '../dialog/dialog';
import { AuditBlock } from './audit-block';

/** One read-only value in the details dialog; {@code label} is a translation key. */
export interface DetailField {
  label: string;
  value?: string | number | boolean | null;
  /** How to show the value (default text). */
  kind?: 'text' | 'money' | 'date' | 'datetime' | 'phone' | 'status' | 'multiline' | 'ltr';
  /** status: green when true / given, grey otherwise. */
  on?: boolean;
  /** Spans the whole row (long text). */
  full?: boolean;
}

/**
 * Read-only details of a record: value tiles, optional extra sections (projected), and who created / last changed
 * it. Every list page opens it from the eye button in the table.
 */
@Component({
  selector: 'app-details-dialog',
  imports: [AppDialog, AuditBlock, Button, TranslatePipe, SarPipe, PhonePipe, LocalDatePipe],
  templateUrl: './details-dialog.html',
})
export class DetailsDialog {
  readonly visible = model(false);
  readonly title = input<string>('');
  readonly subtitle = input<string | null | undefined>(null);
  readonly icon = input<string>('pi pi-eye');
  readonly fields = input<DetailField[]>([]);
  readonly audit = input<AuditInfo | null | undefined>(null);
  readonly canEdit = input(false);
  /** The main button's label (translation key) and icon: "Edit" by default, e.g. "Open" for records with a page. */
  readonly editLabel = input('common.edit');
  readonly editIcon = input('pi pi-pencil');
  readonly width = input('980px');
  readonly edit = output<void>();

  protected isEmpty(f: DetailField): boolean {
    return f.value === null || f.value === undefined || f.value === '';
  }

  protected onEdit(): void {
    this.visible.set(false);
    this.edit.emit();
  }
}
