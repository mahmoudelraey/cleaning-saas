import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { ProgressSpinner } from 'primeng/progressspinner';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { compressImage } from '../../shared/image-compress';
import { FieldApi, MediaItem, MediaKind } from './field.api';

/**
 * Before/after photos of a visit. Thumbnails are loaded as authenticated blobs and revoked on destroy.
 * `canUpload` is decided by the parent (status + role); the API enforces the same rules.
 */
@Component({
  selector: 'app-photo-gallery',
  imports: [NgTemplateOutlet, TranslatePipe, Button, Dialog, ProgressSpinner],
  styles: `
    .section + .section { margin-top: 1.25rem; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .6rem; }
    .head h3 { margin: 0; font-size: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: .5rem; }
    .thumb { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: var(--fo-bg);
             border: 1px solid var(--fo-border); cursor: zoom-in; display: grid; place-items: center; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .thumb .del { position: absolute; top: 4px; inset-inline-end: 4px; }
    .empty-small { color: var(--fo-muted); font-size: .9rem; padding: .5rem 0; }
    .viewer { max-width: 100%; max-height: 75vh; display: block; margin: 0 auto; border-radius: 8px; }
    input[type='file'] { display: none; }

    /* variant="cards": before/after side by side in dashed drop boxes (booking page) */
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    @media (max-width: 560px) { .cards { grid-template-columns: minmax(0, 1fr); } }
    .box { border: 1.5px dashed var(--fo-border); border-radius: 12px; padding: 1.25rem 1rem; display: flex; flex-direction: column;
           align-items: center; gap: .5rem; text-align: center; min-width: 0; }
    .box > i { font-size: 1.6rem; color: var(--fo-muted); }
    .box h3 { margin: 0; font-size: .95rem; font-weight: 700; }
    .box .sub { color: var(--fo-muted); font-size: .82rem; }
    .box .grid { width: 100%; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); margin: .25rem 0; }
  `,
  template: `
    <ng-template #thumbs let-k>
      <div class="grid">
        @for (m of byKind()[k]; track m.id) {
          <div class="thumb" (click)="view(m)">
            @if (urls()[m.id]; as url) {
              <img [src]="url" [alt]="'photos.' + k | translate" loading="lazy" />
            } @else {
              <p-progressspinner strokeWidth="6" [style]="{ width: '28px', height: '28px' }" />
            }
            @if (canDelete(m)) {
              <p-button class="del" icon="pi pi-trash" severity="danger" [rounded]="true" size="small" (onClick)="remove(m, $event)" />
            }
          </div>
        }
      </div>
    </ng-template>

    @if (variant() === 'cards') {
      <div class="cards">
        @for (k of kinds; track k) {
          <div class="box">
            @if (!byKind()[k].length) { <i class="pi pi-camera"></i> }
            <h3>{{ 'photos.title' + k | translate }} <span class="ltr">({{ byKind()[k].length }})</span></h3>
            @if (byKind()[k].length) {
              <ng-container *ngTemplateOutlet="thumbs; context: { $implicit: k }" />
            } @else {
              <span class="sub">{{ 'photos.noneYet' | translate }}</span>
            }
            @if (canUpload()) {
              <p-button
                icon="pi pi-plus"
                [label]="'photos.addMany' | translate"
                size="small"
                [outlined]="true"
                [loading]="uploading() === k"
                (onClick)="pick(k, fileInputCard)"
              />
              <input #fileInputCard type="file" accept="image/*" capture="environment" multiple (change)="onFiles(k, $event)" />
            }
          </div>
        }
      </div>
    } @else {
    @for (k of kinds; track k) {
      <div class="section">
        <div class="head">
          <h3>{{ 'photos.' + k | translate }} <span class="muted">({{ byKind()[k].length }})</span></h3>
          @if (canUpload()) {
            <p-button
              icon="pi pi-camera"
              [label]="'photos.add' | translate"
              size="small"
              [outlined]="true"
              [loading]="uploading() === k"
              (onClick)="pick(k, fileInput)"
            />
            <input #fileInput type="file" accept="image/*" capture="environment" multiple (change)="onFiles(k, $event)" />
          }
        </div>
        @if (byKind()[k].length) {
          <ng-container *ngTemplateOutlet="thumbs; context: { $implicit: k }" />
        } @else {
          <div class="empty-small">{{ 'photos.none' | translate }}</div>
        }
      </div>
    }
    }

    <p-dialog [(visible)]="viewerOpen" [modal]="true" [dismissableMask]="true" [style]="{ width: '90vw', maxWidth: '900px' }" [draggable]="false" [header]="viewerTitle()">
      @if (viewing(); as v) {
        <img class="viewer" [src]="urls()[v.id]" alt="" />
      }
    </p-dialog>
  `,
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
