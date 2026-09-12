import { BasePayApiError, createSession, getSession } from './api.js';
import { formatCountdown, truncateAddress, truncateHash, trimUsdc } from './format.js';
import { renderQrSvg } from './qr.js';
import { WIDGET_CSS } from './styles.js';
import type { SessionStatus, SessionView, WidgetOptions } from './types.js';
import { detectProvider, payWithWallet, WalletError } from './wallet.js';

interface StatusCopy {
  title: string;
  detail: string;
  tone: 'idle' | 'ok' | 'warn' | 'err';
}

/**
 * Copy rules: plain and active, say what happened, and when something went wrong
 * say what to do next. No jargon the buyer did not sign up for.
 */
function statusCopy(session: SessionView): StatusCopy {
  switch (session.status) {
    case 'pending':
      return {
        title: 'Waiting for payment',
        detail: `Send exactly ${trimUsdc(session.amountUsdc)} USDC on Base to the address below.`,
        tone: 'idle',
      };
    case 'confirming':
      return {
        title: 'Payment received, confirming',
        detail: `${session.confirmations} of ${session.confirmationsRequired} confirmations. Keep this page open.`,
        tone: 'idle',
      };
    case 'paid':
      return { title: 'Payment received', detail: 'Thank you. Your payment is confirmed.', tone: 'ok' };
    case 'underpaid':
      return {
        title: 'Not enough was received',
        detail:
          `We received ${trimUsdc(session.receivedUsdc)} USDC of the ${trimUsdc(session.amountUsdc)} USDC due. ` +
          'Contact the store to sort this out — nothing was sent back automatically.',
        tone: 'err',
      };
    case 'expired':
      return {
        title: 'This payment window closed',
        detail: 'Prices move, so quotes expire. Start again to get a fresh amount.',
        tone: 'warn',
      };
  }
}

/** Maps a server error code to copy a buyer can act on. */
function errorCopy(err: unknown): StatusCopy {
  const code = err instanceof BasePayApiError ? err.code : '';
  switch (code) {
    case 'PRICE_UNAVAILABLE':
      return {
        title: 'Payments are paused',
        detail: 'We cannot confirm the USDC price right now, so we will not quote you a wrong amount. Try again in a few minutes.',
        tone: 'warn',
      };
    case 'AMOUNT_SLOTS_EXHAUSTED':
    case 'AMOUNT_SLOTS_CONTENDED':
      return {
        title: 'Too many checkouts are open',
        detail: 'This store has more payments in flight than it can tell apart. Try again in a minute.',
        tone: 'warn',
      };
    case 'RATE_LIMITED':
      return { title: 'Too many attempts', detail: 'Wait a minute, then try again.', tone: 'warn' };
    case 'MERCHANT_NOT_FOUND':
      return { title: 'This store is not set up for payments', detail: 'Contact the store owner.', tone: 'err' };
    case 'INVALID_AMOUNT':
      return { title: 'That amount cannot be charged', detail: 'Contact the store owner.', tone: 'err' };
    default:
      return {
        title: 'We could not start the payment',
        detail: 'The payment service did not respond. Check your connection and try again.',
        tone: 'err',
      };
  }
}

const TERMINAL: readonly SessionStatus[] = ['paid', 'underpaid', 'expired'];

export class PaymentWidget {
  private readonly root: ShadowRoot;
  private readonly host: HTMLElement;
  private session: SessionView | null = null;
  private pollTimer: number | null = null;
  private countdownTimer: number | null = null;
  private destroyed = false;

  private els: {
    status: HTMLElement;
    statusTitle: HTMLElement;
    statusDetail: HTMLElement;
    countdown: HTMLElement;
    amount: HTMLElement;
    usdc: HTMLElement;
    order: HTMLElement;
    qr: HTMLElement;
    address: HTMLElement;
    amountValue: HTMLElement;
    actions: HTMLElement;
    tx: HTMLElement;
    footnote: HTMLElement;
  } | null = null;

  constructor(private readonly options: WidgetOptions) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-basepay', 'widget');
    // Shadow DOM is the whole isolation strategy: a Webflow page can style
    // anything it likes and none of it reaches inside here, or vice versa.
    this.root = this.host.attachShadow({ mode: 'open' });
    this.options.target.appendChild(this.host);
  }

  async mount(): Promise<void> {
    this.renderShell();
    this.setStatus({ title: 'Preparing your payment…', detail: '', tone: 'idle' });

    try {
      const session = await createSession(this.options.apiBaseUrl, {
        merchantId: this.options.merchantId,
        amountUsd: this.options.amountUsd,
        orderRef: this.options.orderRef,
      });
      this.applySession(session);
      this.startPolling();
      this.startCountdown();
    } catch (err) {
      this.renderFatal(errorCopy(err));
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopTimers();
    this.host.remove();
  }

  // ---------------------------------------------------------------- rendering

  private renderShell(): void {
    const style = document.createElement('style');
    style.textContent = WIDGET_CSS;

    const card = document.createElement('section');
    card.className = 'card';
    card.setAttribute('aria-label', 'Pay with USDC');
    card.innerHTML = `
      <div class="head">
        <div>
          <p class="amount" data-el="amount">—</p>
          <p class="usdc" data-el="usdc"></p>
          <p class="order" data-el="order" hidden></p>
        </div>
        <div class="countdown" data-el="countdown" hidden></div>
      </div>

      <div class="status" data-el="status" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        <span>
          <span class="title" data-el="statusTitle"></span>
          <span class="detail" data-el="statusDetail"></span>
        </span>
      </div>

      <div class="qr-wrap" data-el="qrWrap" hidden><div class="qr" data-el="qr"></div></div>

      <div class="field" data-el="addressField" hidden>
        <span class="label" id="bp-address-label">Send USDC on Base to</span>
        <div class="value-row">
          <span class="value" data-el="address" aria-labelledby="bp-address-label"></span>
          <button type="button" data-action="copy-address">Copy</button>
        </div>
      </div>

      <div class="field" data-el="amountField" hidden>
        <span class="label" id="bp-amount-label">Exact amount</span>
        <div class="value-row">
          <span class="value" data-el="amountValue" aria-labelledby="bp-amount-label"></span>
          <button type="button" data-action="copy-amount">Copy</button>
        </div>
      </div>

      <div class="actions" data-el="actions"></div>
      <p class="tx" data-el="tx" hidden></p>
      <p class="footnote" data-el="footnote" hidden></p>
    `;

    this.root.replaceChildren(style, card);

    const pick = (name: string): HTMLElement => {
      const el = this.root.querySelector<HTMLElement>(`[data-el="${name}"]`);
      if (!el) throw new Error(`widget element ${name} missing`);
      return el;
    };

    this.els = {
      status: pick('status'),
      statusTitle: pick('statusTitle'),
      statusDetail: pick('statusDetail'),
      countdown: pick('countdown'),
      amount: pick('amount'),
      usdc: pick('usdc'),
      order: pick('order'),
      qr: pick('qr'),
      address: pick('address'),
      amountValue: pick('amountValue'),
      actions: pick('actions'),
      tx: pick('tx'),
      footnote: pick('footnote'),
    };

    card.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      if (!target) return;
      void this.handleAction(target.dataset['action'] ?? '', target);
    });
  }

  private applySession(session: SessionView): void {
    this.session = session;
    const els = this.els;
    if (!els) return;

    els.amount.textContent = `Pay $${session.amountUsd}`;
    els.usdc.textContent = `${trimUsdc(session.amountUsdc)} USDC on Base`;

    if (session.orderRef) {
      els.order.textContent = `Order ${session.orderRef}`;
      els.order.hidden = false;
    }

    const open = session.status === 'pending' || session.status === 'confirming';
    this.toggle('qrWrap', open);
    this.toggle('addressField', open);
    this.toggle('amountField', open);
    els.countdown.hidden = session.status !== 'pending';

    if (open && els.qr.childElementCount === 0) {
      const svg = renderQrSvg(session.paymentUri, { size: 216 });
      svg.setAttribute('aria-label', `QR code to pay ${trimUsdc(session.amountUsdc)} USDC to ${session.payToAddress}`);
      els.qr.appendChild(svg);
    }

    els.address.textContent = session.payToAddress;
    els.address.title = session.payToAddress;
    els.amountValue.textContent = `${session.amountUsdc} USDC`;

    this.setStatus(statusCopy(session));
    this.renderActions(session);
    this.renderTransactions(session);
    this.renderFootnote(session);
    this.updateCountdown();
  }

  private renderActions(session: SessionView): void {
    const els = this.els;
    if (!els) return;
    els.actions.replaceChildren();

    if (session.status === 'paid' || session.status === 'underpaid') return;

    if (session.status === 'expired') {
      els.actions.appendChild(this.button('Start a new payment', 'restart', true));
      return;
    }

    const hasWallet = detectProvider() !== null;
    const payButton = this.button(
      hasWallet ? `Pay ${trimUsdc(session.amountUsdc)} USDC` : 'Open your wallet app',
      'pay',
      true,
    );
    if (!hasWallet) {
      payButton.disabled = true;
      payButton.title = 'No browser wallet detected. Scan the QR code with your wallet app instead.';
    }
    els.actions.appendChild(payButton);

    if (session.onramp) {
      // A real anchor, styled to look like a button: it opens a new tab, so the
      // keyboard and screen-reader semantics of a link are the correct ones.
      const link = document.createElement('a');
      link.className = 'secondary';
      link.href = session.onramp.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `No crypto? ${session.onramp.label}`;
      els.actions.appendChild(link);
    }
  }

  private renderTransactions(session: SessionView): void {
    const els = this.els;
    if (!els) return;
    const tx = session.transactions[0];
    if (!tx) {
      els.tx.hidden = true;
      return;
    }
    els.tx.replaceChildren();
    const label = document.createTextNode('Transaction: ');
    const link = document.createElement('a');
    link.href = `${this.options.explorerBaseUrl.replace(/\/$/, '')}/tx/${tx.txHash}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = truncateHash(tx.txHash);
    els.tx.append(label, link);
    els.tx.hidden = false;
  }

  private renderFootnote(session: SessionView): void {
    const els = this.els;
    if (!els) return;
    if (session.status !== 'pending' && session.status !== 'confirming') {
      els.footnote.hidden = true;
      return;
    }
    els.footnote.textContent =
      `Send the exact amount — it is how this payment is identified. ` +
      `Funds go straight to ${truncateAddress(session.payToAddress)}; nothing is held in between.` +
      (session.priceStale ? ' Note: this quote used a delayed price.' : '');
    els.footnote.hidden = false;
  }

  private setStatus(copy: StatusCopy): void {
    const els = this.els;
    if (!els) return;
    els.status.dataset['tone'] = copy.tone;
    els.statusTitle.textContent = copy.title;
    els.statusDetail.textContent = copy.detail;
  }

  private renderFatal(copy: StatusCopy): void {
    this.stopTimers();
    const els = this.els;
    if (!els) return;
    this.toggle('qrWrap', false);
    this.toggle('addressField', false);
    this.toggle('amountField', false);
    els.countdown.hidden = true;
    els.footnote.hidden = true;
    this.setStatus(copy);
    els.actions.replaceChildren(this.button('Try again', 'restart', true));
  }

  private button(label: string, action: string, primary = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset['action'] = action;
    if (primary) button.className = 'primary';
    return button;
  }

  private toggle(name: string, visible: boolean): void {
    const el = this.root.querySelector<HTMLElement>(`[data-el="${name}"]`);
    if (el) el.hidden = !visible;
  }

  // ------------------------------------------------------------------ actions

  private async handleAction(action: string, trigger: HTMLElement): Promise<void> {
    const session = this.session;
    switch (action) {
      case 'copy-address':
        if (session) await this.copy(session.payToAddress, trigger);
        return;
      case 'copy-amount':
        if (session) await this.copy(session.amountUsdc, trigger);
        return;
      case 'restart':
        this.stopTimers();
        this.session = null;
        await this.mount();
        return;
      case 'pay':
        if (session) await this.pay(session, trigger as HTMLButtonElement);
        return;
      default:
        return;
    }
  }

  private async copy(text: string, trigger: HTMLElement): Promise<void> {
    const original = trigger.textContent ?? 'Copy';
    try {
      await navigator.clipboard.writeText(text);
      trigger.textContent = 'Copied';
    } catch {
      trigger.textContent = 'Press ⌘C';
    }
    window.setTimeout(() => {
      if (!this.destroyed) trigger.textContent = original;
    }, 1600);
  }

  private async pay(session: SessionView, button: HTMLButtonElement): Promise<void> {
    const original = button.textContent ?? '';
    button.disabled = true;
    button.textContent = 'Confirm in your wallet…';
    try {
      await payWithWallet(session);
      // The transaction is signed, but it is only paid when the backend sees it
      // confirmed on-chain. Polling continues to decide that.
      this.setStatus({
        title: 'Payment sent',
        detail: 'Waiting for the network to confirm it. Keep this page open.',
        tone: 'idle',
      });
      void this.poll();
    } catch (err) {
      const message =
        err instanceof WalletError
          ? err.message
          : 'Something went wrong talking to your wallet. Try again, or scan the QR code instead.';
      this.setStatus({ title: 'Payment not sent', detail: message, tone: 'err' });
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  // ------------------------------------------------------------------ polling

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => void this.poll(), this.options.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Polling is the single source of truth for status, whichever way the buyer
   * paid — browser wallet, a wallet app scanning the QR, or a fiat on-ramp that
   * delivers minutes later.
   */
  private async poll(): Promise<void> {
    const current = this.session;
    if (!current || this.destroyed) return;
    try {
      const next = await getSession(this.options.apiBaseUrl, current.sessionId);
      if (this.destroyed) return;
      this.applySession(next);
      if (TERMINAL.includes(next.status)) {
        this.stopTimers();
        this.host.dispatchEvent(
          new CustomEvent('basepay:settled', { detail: { status: next.status, sessionId: next.sessionId }, bubbles: true, composed: true }),
        );
      }
    } catch {
      // A transient network blip must not wipe a correct screen; the next tick retries.
    }
  }

  private startCountdown(): void {
    if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer);
    this.countdownTimer = window.setInterval(() => this.updateCountdown(), 1000);
  }

  private updateCountdown(): void {
    const session = this.session;
    const els = this.els;
    if (!session || !els) return;
    if (session.status !== 'pending') {
      els.countdown.hidden = true;
      return;
    }

    const remaining = new Date(session.expiresAt).getTime() - Date.now();
    els.countdown.hidden = false;
    els.countdown.textContent = `Expires in ${formatCountdown(remaining)}`;
    els.countdown.dataset['urgent'] = String(remaining <= 60_000);

    if (remaining <= 0) {
      // The server decides expiry; poll immediately so the UI follows the record
      // rather than guessing ahead of it.
      void this.poll();
    }
  }

  private stopTimers(): void {
    this.stopPolling();
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
