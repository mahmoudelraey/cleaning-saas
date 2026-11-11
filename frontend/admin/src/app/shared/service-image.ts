/**
 * The picture shown for a service when the company has not uploaded its own: chosen from the service's name
 * (Arabic or English). Same rules as the customer portal, so the admin preview matches what customers see.
 */
export function defaultServiceImage(name?: string | null, nameEn?: string | null): string {
  const n = `${name ?? ''} ${nameEn ?? ''}`.toLowerCase();
  if (/سيار|car|auto|vehicle/.test(n)) return 'services/car.jpg';
  if (/كنب|كنب|سجاد|موكيت|مفروش|مرات|ستائر|sofa|couch|carpet|rug|upholster|mattress|curtain/.test(n)) return 'services/sofa.jpg';
  if (/فيلا|فلل|قصر|استراحة|villa|palace|mansion/.test(n)) return 'services/villa.jpg';
  return 'services/home.jpg';
}
