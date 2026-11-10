/**
 * Address of the customer portal (frontend/portal). Set it to force one, e.g. 'https://example.sa'.
 * Empty: worked out from this app's address:
 *   dev :4200 → :4300, docker :8081 → :8082,
 *   production app.example.sa → example.sa (the deploy/ Caddyfile serves the portal on the bare domain),
 *   otherwise the same host.
 */
export const PORTAL_BASE_URL = '';

const DEV_PORTS: Record<string, string> = { '4200': '4300', '8081': '8082' };

/** The portal's address without a trailing slash, e.g. 'https://example.sa'. */
export function portalBase(): string {
  const { protocol, hostname, port, origin } = location;
  let base = PORTAL_BASE_URL;
  if (!base) {
    if (DEV_PORTS[port]) {
      base = `${protocol}//${hostname}:${DEV_PORTS[port]}`;
    } else if (hostname.startsWith('app.')) {
      base = `${protocol}//${hostname.slice('app.'.length)}${port ? `:${port}` : ''}`;
    } else {
      base = origin;
    }
  }
  return base.replace(/\/+$/, '');
}

/** The company's own portal link: {portal}/{slug}. */
export function portalUrl(slug: string): string {
  return `${portalBase()}/${encodeURIComponent(slug)}`;
}
