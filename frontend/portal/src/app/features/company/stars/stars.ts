import { Component, computed, input } from '@angular/core';

/** Five stars for a 1–5 rating, with a half star for averages. Decorative: the number is always shown in text too. */
@Component({
  selector: 'pt-stars',
  styleUrl: './stars.scss',
  templateUrl: './stars.html',
})
export class Stars {
  readonly value = input.required<number>();
  protected readonly icons = computed(() => {
    const v = Math.round(this.value() * 2) / 2;
    return [1, 2, 3, 4, 5].map((n) =>
      v >= n ? { icon: 'pi-star-fill', off: false } : v >= n - 0.5 ? { icon: 'pi-star-half-fill', off: false } : { icon: 'pi-star-fill', off: true },
    );
  });
}
