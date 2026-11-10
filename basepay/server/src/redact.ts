/**
 * Keeps credentials out of anything that leaves the process: log lines and the
 * public `/readyz` body.
 *
 * RPC providers put the API key in the URL path (Alchemy, Infura, Ankr),
 * connection strings put the password in the userinfo, and client libraries
 * quote those URLs verbatim in their error messages. So every URL in the text
 * is cut down to its scheme and host.
 */

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>\\]+/gi;

export function redactUrls(text: string): string {
  return text.replace(URL_PATTERN, (match) => {
    let url: URL;
    try {
      url = new URL(match);
    } catch {
      return '[redacted-url]';
    }
    const origin = `${url.protocol}//${url.host}`;
    const hasMore =
      url.username !== '' ||
      url.password !== '' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.search !== '' ||
      url.hash !== '';
    return hasMore ? `${origin}/[redacted]` : origin;
  });
}

/** `redactUrls` applied to every string inside a value, for structured log fields. */
export function redactDeep(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactUrls(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, seen));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = redactDeep(item, seen);
  return out;
}
