export type SessionStatus = 'pending' | 'confirming' | 'paid' | 'underpaid' | 'expired';

/** Statuses that still hold their amount-offset reservation. */
export const OPEN_STATUSES = ['pending', 'confirming'] as const satisfies readonly SessionStatus[];

export type PaymentMatchKind = 'exact' | 'underpaid' | 'overpaid' | 'unmatched';
export type PaymentStatus = 'active' | 'orphaned';
export type WebhookStatus = 'pending' | 'delivered' | 'dead';
export type WebhookEventType = 'payment.paid' | 'payment.underpaid';

export type MerchantPlan = 'free' | 'pro';

export interface Merchant {
  id: string;
  walletAddress: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
  plan: MerchantPlan;
  /** When a `pro` plan lapses; null means it does not. */
  planExpiresAt: Date | null;
  /** SHA-256 of the merchant key issued at self-registration; null for operator-seeded merchants. */
  merchantKeyHash: string | null;
  siteUrl: string | null;
  /** Where the merchant integrated from, e.g. `woocommerce`; free text. */
  platform: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  merchantId: string;
  orderRef: string | null;
  status: SessionStatus;
  amountUsdCents: bigint;
  usdcPriceUsd: string;
  priceStale: boolean;
  baseAmountUsdc: bigint;
  amountOffset: number;
  amountUsdc: bigint;
  payToAddress: string;
  receivedUsdc: bigint;
  confirmations: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  firstSeenAt: Date | null;
  settledAt: Date | null;
}

export interface Payment {
  id: bigint;
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  fromAddress: string;
  toAddress: string;
  amountUsdc: bigint;
  sessionId: string | null;
  matchKind: PaymentMatchKind;
  status: PaymentStatus;
  observedAt: Date;
  orphanedAt: Date | null;
}

export interface WebhookDelivery {
  id: string;
  merchantId: string;
  sessionId: string | null;
  eventType: WebhookEventType;
  url: string;
  payload: Record<string, unknown>;
  status: WebhookStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  lastStatusCode: number | null;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
}

export interface WatcherState {
  id: string;
  lastProcessedBlock: bigint;
  lastProcessedBlockHash: string | null;
  updatedAt: Date;
}
