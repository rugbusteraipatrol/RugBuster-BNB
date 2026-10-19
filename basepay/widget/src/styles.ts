/**
 * All widget CSS. Injected into a shadow root, so nothing here leaks into the
 * host page and no Webflow stylesheet can reach in. Every property the widget
 * depends on is set explicitly rather than inherited — `all: initial` on :host
 * would also work but breaks font inheritance people reasonably expect.
 */
export const WIDGET_CSS = `
:host {
  --bp-bg: #ffffff;
  --bp-fg: #0b0d12;
  --bp-muted: #5b6472;
  --bp-border: #e3e7ee;
  --bp-accent: #0052ff;
  --bp-accent-fg: #ffffff;
  --bp-ok: #0f7b43;
  --bp-ok-bg: #e6f6ed;
  --bp-warn: #8a5a00;
  --bp-warn-bg: #fdf3e0;
  --bp-err: #a51c1c;
  --bp-err-bg: #fdeaea;
  --bp-radius: 14px;

  all: initial;
  display: block;
  contain: content;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--bp-fg);
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after { box-sizing: border-box; }

.card {
  background: var(--bp-bg);
  border: 1px solid var(--bp-border);
  border-radius: var(--bp-radius);
  padding: 20px;
  max-width: 420px;
  margin: 0 auto;
}

.head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.amount { font-size: 30px; font-weight: 650; letter-spacing: -0.02em; margin: 0; }
.usdc { color: var(--bp-muted); font-size: 14px; font-variant-numeric: tabular-nums; margin: 2px 0 0; }
.order { color: var(--bp-muted); font-size: 13px; margin: 2px 0 0; }

.countdown {
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  color: var(--bp-muted);
  white-space: nowrap;
}
.countdown[data-urgent="true"] { color: var(--bp-err); font-weight: 600; }

.status {
  display: flex; align-items: center; gap: 10px;
  margin: 16px 0 0; padding: 12px 14px;
  border-radius: 10px; font-size: 14px;
  background: #f4f6fa; color: var(--bp-muted);
}
.status[data-tone="ok"] { background: var(--bp-ok-bg); color: var(--bp-ok); }
.status[data-tone="warn"] { background: var(--bp-warn-bg); color: var(--bp-warn); }
.status[data-tone="err"] { background: var(--bp-err-bg); color: var(--bp-err); }
.status .title { font-weight: 600; color: inherit; }
.status .detail { display: block; font-weight: 400; margin-top: 2px; }

.dot {
  flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%;
  background: currentColor; animation: bp-pulse 1.6s ease-in-out infinite;
}
.status[data-tone="ok"] .dot, .status[data-tone="err"] .dot { animation: none; }
@keyframes bp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.qr-wrap { display: flex; justify-content: center; margin: 18px 0 0; }
.qr {
  padding: 10px; background: #fff;
  border: 1px solid var(--bp-border); border-radius: 12px; line-height: 0;
}

.field { margin: 16px 0 0; }
.label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bp-muted); margin-bottom: 6px; }
.value-row { display: flex; align-items: stretch; gap: 8px; }
.value {
  flex: 1 1 auto; min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px; background: #f7f9fc; border: 1px solid var(--bp-border);
  border-radius: 9px; padding: 9px 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

button {
  font: inherit; cursor: pointer; border-radius: 10px;
  border: 1px solid var(--bp-border); background: #fff; color: var(--bp-fg);
  padding: 10px 14px; transition: background-color 120ms ease, border-color 120ms ease;
}
button:hover:not(:disabled) { background: #f4f6fa; }
button:disabled { cursor: not-allowed; opacity: 0.55; }

.actions { display: grid; gap: 10px; margin-top: 18px; }
.primary {
  background: var(--bp-accent); color: var(--bp-accent-fg);
  border-color: var(--bp-accent); font-weight: 600; padding: 13px 16px;
}
.primary:hover:not(:disabled) { background: #0047dd; border-color: #0047dd; }
.secondary {
  display: block; text-align: center; text-decoration: none;
  color: var(--bp-fg); background: #fff;
  border: 1px solid var(--bp-border); border-radius: 10px; padding: 10px 14px;
  transition: background-color 120ms ease;
}
.secondary:hover { background: #f4f6fa; }

/* A visible focus ring is not optional: this is a payment flow. */
:is(button, a, [tabindex]):focus-visible {
  outline: 3px solid var(--bp-accent);
  outline-offset: 2px;
}

.tx { margin: 14px 0 0; font-size: 13px; }
.tx a { color: var(--bp-accent); }
.footnote { margin: 14px 0 0; font-size: 12px; color: var(--bp-muted); }
.footnote code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

@media (max-width: 420px) {
  .card { padding: 16px; border-radius: 12px; }
  .amount { font-size: 26px; }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

@media (prefers-color-scheme: dark) {
  :host {
    --bp-bg: #14161c;
    --bp-fg: #f2f4f8;
    --bp-muted: #9aa4b5;
    --bp-border: #2a2f3a;
    --bp-ok: #5fd39a; --bp-ok-bg: #14301f;
    --bp-warn: #f0c274; --bp-warn-bg: #33270f;
    --bp-err: #f28a8a; --bp-err-bg: #3a1717;
  }
  .status { background: #1c2029; }
  .value { background: #1c2029; }
  button, .secondary { background: #1c2029; color: var(--bp-fg); }
  .secondary:hover { background: #242935; }
  button:hover:not(:disabled) { background: #242935; }
}
`;
