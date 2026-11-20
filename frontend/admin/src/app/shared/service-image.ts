/**
 * The picture shown for a service when the company has not uploaded its own: chosen from the service's name
 * (Arabic or English). Same rules as the customer portal, so the admin preview matches what customers see.
 */
export function defaultServiceImage(name?: string | null, nameEn?: string | null): string {
  const n = `${name ?? ''} ${nameEn ?? ''}`.toLowerCase();
  // Cars only ("carpet" is not a car); everything else shows the home picture.
  if (/سيار|\bcars?\b|\bauto|vehicle/.test(n)) return 'services/car.jpg';
  return 'services/home.jpg';
}
