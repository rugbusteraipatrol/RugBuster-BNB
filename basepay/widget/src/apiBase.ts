/**
 * Cloudflare answers the bare stablecart.org with a 301 to www. A browser
 * turns a redirected POST into a GET, and a CORS preflight may not follow a
 * redirect at all, so a widget that loaded its script from the bare domain
 * could never open a session. The API is reached on www directly instead.
 */
const REDIRECTED_HOSTS: Record<string, string> = {
  'stablecart.org': 'www.stablecart.org',
};

/** The API base without a trailing slash, moved off a host that only redirects. */
export function normalizeApiBaseUrl(base: string): string {
  const trimmed = base.replace(/\/$/, '');
  try {
    const url = new URL(trimmed);
    const target = REDIRECTED_HOSTS[url.hostname];
    if (!target) return trimmed;
    url.hostname = target;
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}
