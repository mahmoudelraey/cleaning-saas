/**
 * The picture shown for a service when the company has not uploaded its own: chosen from the service's name
 * (Arabic or English). Same rules as the customer portal, so the admin preview matches what customers see.
 */
export function defaultServiceImage(name?: string | null, nameEn?: string | null): string {
  const n = `${name ?? ''} ${nameEn ?? ''}`.toLowerCase();
  if (/سيار|car|auto|vehicle/.test(n)) return 'services/car.jpg';
  if (/كنب|سجاد|موكيت|مفروش|مرات|ستائر|sofa|couch|carpet|rug|upholster|mattress|curtain/.test(n)) return 'services/sofa.jpg';
  if (/فيلا|فلل|قصر|استراحة|villa|palace|mansion/.test(n)) return 'services/villa.jpg';
  return 'services/home.jpg';
}

/** A fitting PrimeIcons icon for a service from its name (Arabic or English); a sparkle when nothing matches. */
export function serviceIcon(name?: string | null, nameEn?: string | null): string {
  const n = `${name ?? ''} ${nameEn ?? ''}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/سيار|car|auto/, 'pi-car'],
    [/مكتب|office|شرك|محل|shop|store/, 'pi-building'],
    [/كنب|سجاد|موكيت|مفروش|sofa|carpet|rug|ستائر|curtain/, 'pi-th-large'],
    [/مكيف|تكييف|ac\b|air ?con/, 'pi-sun'],
    [/خزان|tank|water|مياه/, 'pi-filter'],
    [/حشر|pest|مبيد|تعقيم|disinfect|steril/, 'pi-shield'],
    [/شق|بيت|منزل|فيلا|فلل|home|house|apartment|villa|flat/, 'pi-home'],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? 'pi-sparkles';
}
