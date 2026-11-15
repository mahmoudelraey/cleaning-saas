import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { ProgressSpinner } from 'primeng/progressspinner';

import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../core/http/api-error';
import { compressImage } from '../../../shared/image-compress';
import { FieldApi, MediaItem, MediaKind } from '../field.api';

/**
 * Before/after photos of a visit. Thumbnails are loaded as authenticated blobs and revoked on destroy.
 * `canUpload` is decided by the parent (status + role); the API enforces the same rules.
 */
@Component({
  selector: 'app-photo-gallery',
  imports: [NgTemplateOutlet, TranslatePipe, Button, Dialog, ProgressSpinner],
  styleUrl: './photo-gallery.scss',
  templateUrl: './photo-gallery.html',
})
export class PhotoGallery implements OnInit, OnDestroy {
  private readonly api = inject(FieldApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  readonly bookingId = input.required<string>();
  readonly canUpload = input(false);
  /** 'list' = stacked sections (technician visit page); 'cards' = side-by-side boxes (booking page). */
  readonly variant = input<'list' | 'cards'>('list');
  /** Technicians may only delete their own photos before completion. */
  readonly completed = input(false);
  readonly changed = output<number>();

  protected readonly kinds: MediaKind[] = ['BEFORE', 'AFTER'];
  protected readonly items = signal<MediaItem[]>([]);
  protected readonly urls = signal<Record<string, string>>({});
  protected readonly uploading = signal<MediaKind | null>(null);
  protected readonly viewing = signal<MediaItem | null>(null);
  protected readonly viewerOpen = signal(false);

  protected readonly byKind = computed(() => {
    const groups: Record<MediaKind, MediaItem[]> = { BEFORE: [], AFTER: [], OTHER: [] };
    for (const m of this.items()) {
      (m.kind === 'OTHER' ? groups.AFTER : groups[m.kind]).push(m);
    }
    return groups;
  });
  protected readonly viewerTitle = computed(() => {
    const v = this.viewing();
    return v ? `${this.translate.instant('photos.' + (v.kind === 'OTHER' ? 'AFTER' : v.kind))}${v.uploadedByName ? ' · ' + v.uploadedByName : ''}` : '';
  });

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    Object.values(this.urls()).forEach((u) => URL.revokeObjectURL(u));
  }

  reload(): void {
    this.api.listMedia(this.bookingId()).subscribe({
      next: (list) => {
        this.items.set(list);
        this.changed.emit(list.length);
        for (const m of list) {
          if (!this.urls()[m.id]) {
            this.api.content(m.id).subscribe((blob) =>
              this.urls.set({ ...this.urls(), [m.id]: URL.createObjectURL(blob) }),
            );
          }
        }
      },
      error: () => {},
    });
  }

  pick(kind: MediaKind, input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  async onFiles(kind: MediaKind, event: Event): Promise<void> {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) {
      return;
    }
    this.uploading.set(kind);
    try {
      for (const f of files) {
        const { blob, name } = await compressImage(f);
        await new Promise<void>((resolve) =>
          this.api.upload(this.bookingId(), kind, blob, name).subscribe({
            next: () => resolve(),
            error: (err) => {
              this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
              resolve();
            },
          }),
        );
      }
    } finally {
      this.uploading.set(null);
      this.reload();
    }
  }

  view(m: MediaItem): void {
    this.viewing.set(m);
    this.viewerOpen.set(true);
  }

  canDelete(m: MediaItem): boolean {
    if (this.auth.hasRole('OWNER', 'COORDINATOR')) {
      return true;
    }
    return this.canUpload() && !this.completed() && m.uploadedByName === this.auth.user()?.name;
  }

  remove(m: MediaItem, event: Event): void {
    event.stopPropagation();
    this.confirm.confirm({
      message: this.translate.instant('photos.confirmDelete'),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.api.delete(m.id).subscribe({
          next: () => {
            const url = this.urls()[m.id];
            if (url) {
              URL.revokeObjectURL(url);
            }
            this.reload();
          },
          error: (err) => this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) }),
        }),
    });
  }
}
