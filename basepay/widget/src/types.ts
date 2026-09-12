export type SessionStatus = 'pending' | 'confirming' | 'paid' | 'underpaid' | 'expired';

export interface OnrampLink {
  provider: 'transak' | 'moonpay';
  label: string;
  url: string;
}

/** Mirrors the server's SessionView. Kept as a hand-written type so the widget
 *  bundles with no server code and no shared build step. */
export interface SessionView {
  sessionId: string;
  merchantId: string;
  orderRef: string | null;
  status: SessionStatus;
  amountUsd: string;
  amountUsdc: string;
  amountUsdcMicro: string;
  receivedUsdc: string;
  payToAddress: string;
  chainId: number;
  token: { address: string; symbol: string; decimals: number };
  paymentUri: string;
  priceUsd: string;
  priceStale: boolean;
  confirmations: number;
  confirmationsRequired: number;
  createdAt: string;
  expiresAt: string;
  settledAt: string | null;
  transactions: Array<{ txHash: string; blockNumber: string; amountUsdc: string; from: string }>;
  onramp: OnrampLink | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface WidgetOptions {
  apiBaseUrl: string;
  merchantId: string;
  amountUsd: string;
  orderRef: string | null;
  target: HTMLElement;
  pollIntervalMs: number;
  /** Block explorer root used for transaction links. */
  explorerBaseUrl: string;
}
