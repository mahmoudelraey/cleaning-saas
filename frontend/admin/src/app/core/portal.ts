/**
 * Address of the customer portal (frontend/portal). Set it for production, e.g. 'https://my.example.sa'.
 * Empty: worked out from this app's address (dev :4200 → :4300, docker :8081 → :8082, otherwise same host).
 */
export const PORTAL_BASE_URL = '';

const DEV_PORTS: Record<string, string> = { '4200': '4300', '8081': '8082' };

/** The company's own portal link: /p/{slug}. */
export function portalUrl(slug: string): string {
  const { protocol, hostname, port, origin } = location;
  const base = PORTAL_BASE_URL || (DEV_PORTS[port] ? `${protocol}//${hostname}:${DEV_PORTS[port]}` : origin);
  return `${base.replace(/\/+$/, '')}/p/${encodeURIComponent(slug)}`;
}
