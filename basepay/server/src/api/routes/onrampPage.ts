import { Router } from 'express';
import { isUuid } from '../../uuid.js';

/**
 * The page the widget's card link opens, served from BasePay's own origin.
 *
 * Transak checks the Referer of the page that loads its widget against the
 * partner's `referrerDomain`. The widget runs on each merchant's domain, so a
 * link straight to Transak would present a different domain for every
 * merchant; navigating from this page presents ours. It also means the
 * single-use, five-minute widget URL is created when a buyer clicks, not when
 * the checkout renders.
 */
export function onrampPageRoutes(): Router {
  const router = Router();

  router.get('/onramp/:id', (req, res) => {
    const id = String(req.params['id'] ?? '');
    res.setHeader('cache-control', 'no-store');
    // The browser default, stated so no proxy or future middleware strips the
    // Referer Transak relies on.
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('x-robots-tag', 'noindex');

    if (!isUuid(id)) {
      res.status(404).type('html').send(page('This payment link is not valid.', null));
      return;
    }
    res.type('html').send(page('Opening secure card checkout…', id));
  });

  return router;
}

function page(message: string, sessionId: string | null): string {
  // sessionId has passed isUuid, so it is safe inside a script string.
  const script = sessionId
    ? `<script>
      (async () => {
        const status = document.getElementById('status');
        try {
          const response = await fetch('/api/sessions/${sessionId}/onramp', { method: 'POST' });
          const body = await response.json().catch(() => ({}));
          if (response.ok && body.url) {
            location.replace(body.url);
            return;
          }
          status.textContent = (body.error && body.error.message) || 'Card payment is unavailable right now.';
        } catch {
          status.textContent = 'Could not reach the payment service. Check your connection and try again.';
        }
      })();
    </script>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Card checkout — BasePay</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
        font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #f5f7fb; color: #0b0d12;
      }
      p { margin: 0; max-width: 32rem; text-align: center; }
      @media (prefers-color-scheme: dark) { body { background: #0e1014; color: #f2f4f8; } }
    </style>
  </head>
  <body>
    <p id="status" role="status" aria-live="polite">${message}</p>
    <noscript><p>Card checkout needs JavaScript. Pay from a wallet instead.</p></noscript>
    ${script}
  </body>
</html>`;
}
