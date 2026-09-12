import type { WidgetOptions } from './types.js';
import { PaymentWidget } from './ui.js';

/**
 * Entry point for the single-file bundle.
 *
 * Two ways in:
 *   1. Drop the script tag on the page with data- attributes. It mounts itself.
 *      <script src="https://pay.example.com/widget/widget.js"
 *              data-merchant="acme" data-amount-usd="45.00"
 *              data-target="#checkout"></script>
 *   2. Load it with data-auto="false" and call window.BasePay.mount({...}).
 */

const DEFAULT_POLL_INTERVAL_MS = 4000;
const DEFAULT_EXPLORER = 'https://basescan.org';

export interface MountOptions {
  merchantId: string;
  amountUsd: string | number;
  target: HTMLElement | string;
  apiBaseUrl?: string;
  orderRef?: string | null;
  pollIntervalMs?: number;
  explorerBaseUrl?: string;
}

function resolveTarget(target: HTMLElement | string): HTMLElement {
  if (typeof target !== 'string') return target;
  const found = document.querySelector<HTMLElement>(target);
  if (!found) throw new Error(`BasePay: no element matches "${target}"`);
  return found;
}

export function mount(options: MountOptions): PaymentWidget {
  const apiBaseUrl = (options.apiBaseUrl ?? defaultApiBaseUrl(currentScript())).replace(/\/$/, '');
  const widgetOptions: WidgetOptions = {
    apiBaseUrl,
    merchantId: options.merchantId,
    amountUsd: String(options.amountUsd),
    orderRef: options.orderRef ?? null,
    target: resolveTarget(options.target),
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    explorerBaseUrl: options.explorerBaseUrl ?? DEFAULT_EXPLORER,
  };
  const widget = new PaymentWidget(widgetOptions);
  void widget.mount();
  return widget;
}

/**
 * The API lives wherever this script was served from. That makes the Webflow
 * embed a single tag with no second URL to keep in sync.
 */
function defaultApiBaseUrl(script: HTMLScriptElement | null): string {
  if (script) {
    const explicit = script.dataset['api'];
    if (explicit) return explicit;
    try {
      return new URL(script.src, window.location.href).origin;
    } catch {
      // Fall through to the page origin.
    }
  }
  return window.location.origin;
}

function currentScript(): HTMLScriptElement | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement) return current;
  return document.querySelector<HTMLScriptElement>('script[data-merchant]');
}

/**
 * Auto-mount from the script tag's own data attributes. If `data-target` is
 * absent we insert a container right where the script sits, which is how a
 * Webflow embed block behaves.
 */
function autoMount(script: HTMLScriptElement): void {
  if (script.dataset['auto'] === 'false') return;

  const merchantId = script.dataset['merchant'];
  const amountUsd = script.dataset['amountUsd'];
  if (!merchantId || !amountUsd) return;

  let target: HTMLElement;
  const selector = script.dataset['target'];
  if (selector) {
    const found = document.querySelector<HTMLElement>(selector);
    if (!found) {
      console.error(`BasePay: no element matches data-target="${selector}"`);
      return;
    }
    target = found;
  } else {
    target = document.createElement('div');
    script.parentNode?.insertBefore(target, script);
  }

  const explorer = script.dataset['explorer'];
  const poll = Number(script.dataset['pollMs'] ?? '');

  mount({
    merchantId,
    amountUsd,
    target,
    orderRef: script.dataset['orderRef'] ?? null,
    apiBaseUrl: defaultApiBaseUrl(script),
    ...(explorer ? { explorerBaseUrl: explorer } : {}),
    ...(Number.isFinite(poll) && poll >= 1000 ? { pollIntervalMs: poll } : {}),
  });
}

declare global {
  interface Window {
    BasePay?: { mount: typeof mount };
  }
}

window.BasePay = { mount };

// `document.currentScript` is only valid while this script is executing, so
// resolve it now and hand it to the deferred mount rather than looking it up later.
const bootScript = currentScript();
if (bootScript) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => autoMount(bootScript), { once: true });
  } else {
    autoMount(bootScript);
  }
}

export { PaymentWidget };
