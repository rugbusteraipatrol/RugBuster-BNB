import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getAddress } from 'viem';
import type { Config } from '../config.js';
import { USDC_DECIMALS } from '../config.js';
import { getMerchant } from '../db/merchants.js';
import { listActivePaymentsForSession } from '../db/payments.js';
import { isUniqueViolation } from '../db/pool.js';
import {
  expirePendingSessions,
  getSession,
  insertSession,
  takenAmountsInRange,
  extendPendingSession,
} from '../db/sessions.js';
import type { Session } from '../db/types.js';
import { conflict, notFound, unavailable } from '../errors.js';
import { logger } from '../logger.js';
import { buildOnrampLink, type OnrampLink } from '../onramp/index.js';
import type { TransakClient } from '../onramp/transak.js';
import type { PriceService } from '../price/priceService.js';
import { allocateOffset, formatUsd, formatUsdc, OffsetExhaustedError, parseUsdToCents, usdCentsToUsdcMicro } from './amounts.js';

/**
 * Retry budget for the reservation race. Attempt 1 takes the lowest free slot;
 * later attempts probe from a random point, so contention resolves in a couple
 * of rounds even with dozens of simultaneous checkouts.
 */
const MAX_INSERT_ATTEMPTS = 12;

/** How often to re-read the reserved amounts rather than trust the local set. */
const REFRESH_TAKEN_EVERY = 4;

export interface CreateSessionInput {
  merchantId: string;
  amountUsd: string | number;
  orderRef?: string | undefined;
}

export interface SessionView {
  sessionId: string;
  merchantId: string;
  orderRef: string | null;
  status: Session['status'];
  amountUsd: string;
  amountUsdc: string;
  amountUsdcMicro: string;
  receivedUsdc: string;
  payToAddress: string;
  chainId: number;
  token: { address: string; symbol: 'USDC'; decimals: number };
  /** EIP-681 URI; what the QR code encodes. */
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

export class SessionService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly config: Config,
    private readonly priceService: PriceService,
    private readonly transak: TransakClient | null = null,
  ) {}

  /**
   * Quotes a payment and reserves a unique amount for it.
   *
   * The reservation is the insert itself: a partial unique index on
   * (pay-to address, amount_usdc) over open sessions means Postgres — not this
   * process — decides who wins a race. On a lost race we recompute the free
   * offset and try again.
   *
   * The key is the address, not the merchant, because the watcher attributes a
   * transfer by address and amount. Two merchants sharing a wallet must never
   * hold the same open amount.
   */
  async createSession(input: CreateSessionInput): Promise<SessionView> {
    const merchant = await getMerchant(this.pool, input.merchantId);
    if (!merchant) {
      throw notFound('MERCHANT_NOT_FOUND', `Unknown merchant "${input.merchantId}"`);
    }

    let amountUsdCents: bigint;
    try {
      amountUsdCents = parseUsdToCents(input.amountUsd);
    } catch (err) {
      throw conflict('INVALID_AMOUNT', (err as Error).message);
    }

    // Throws PRICE_UNAVAILABLE when the feed has been down too long to quote safely.
    const quote = await this.priceService.getQuote();
    const baseAmountUsdc = usdCentsToUsdcMicro(amountUsdCents, quote.priceUsd);
    if (baseAmountUsdc <= 0n) {
      throw conflict('INVALID_AMOUNT', 'Amount is too small to quote in USDC');
    }

    const offsetMax = this.config.sessions.offsetMax;
    const expiresAt = new Date(Date.now() + this.config.sessions.ttlSeconds * 1000);

    let taken: Set<bigint> = new Set();

    for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt += 1) {
      if (attempt === 1 || (attempt - 1) % REFRESH_TAKEN_EVERY === 0) {
        taken = await takenAmountsInRange(
          this.pool,
          merchant.walletAddress,
          baseAmountUsdc,
          baseAmountUsdc + BigInt(offsetMax),
        );
      }

      // First try the lowest free slot (closest to the true price); after a lost
      // race, start from a random point so racers stop picking the same slot.
      const startAt = attempt === 1 ? 0 : Math.floor(Math.random() * offsetMax);

      let offset: number;
      try {
        offset = allocateOffset(baseAmountUsdc, taken, offsetMax, startAt);
      } catch (err) {
        if (err instanceof OffsetExhaustedError) {
          throw conflict('AMOUNT_SLOTS_EXHAUSTED', err.message, { offsetMax });
        }
        throw err;
      }

      try {
        const session = await insertSession(this.pool, {
          id: randomUUID(),
          merchantId: merchant.id,
          orderRef: input.orderRef ?? null,
          amountUsdCents,
          usdcPriceUsd: quote.priceUsd,
          priceStale: quote.stale,
          baseAmountUsdc,
          amountOffset: offset,
          payToAddress: getAddress(merchant.walletAddress),
          expiresAt,
        });
        return this.toView(session, []);
      } catch (err) {
        if (isUniqueViolation(err, 'sessions_open_amount_uniq')) {
          // Someone else took this slot between our read and our insert.
          taken.add(baseAmountUsdc + BigInt(offset));
          logger.debug({ merchantId: merchant.id, offset, attempt }, 'amount slot taken, retrying');
          continue;
        }
        throw err;
      }
    }

    throw conflict(
      'AMOUNT_SLOTS_CONTENDED',
      'Could not reserve a unique payment amount after several attempts. Please retry.',
    );
  }

  /**
   * Opens the card path for a pending session: a single-use Transak widget URL
   * that pays the merchant's address, created when the buyer asks for it.
   *
   * The session is held for the on-ramp's delivery time first. A card purchase
   * takes minutes, sometimes hours, and a session that expired in the meantime
   * would release its amount and leave the payment unattributed.
   */
  async createCardCheckoutUrl(sessionId: string, userIp: string): Promise<string> {
    const onramp = this.config.onramp;
    if (onramp.provider !== 'transak' || !this.transak) {
      throw notFound('ONRAMP_DISABLED', 'Card payments are not enabled for this checkout');
    }

    const session = await getSession(this.pool, sessionId);
    if (!session) throw notFound('SESSION_NOT_FOUND', 'No such payment session');
    if (session.amountUsdCents < BigInt(onramp.minAmountUsdCents)) {
      throw conflict(
        'ONRAMP_AMOUNT_TOO_SMALL',
        `Card payments start at $${formatUsd(BigInt(onramp.minAmountUsdCents))}`,
      );
    }

    const held = await extendPendingSession(this.pool, sessionId, onramp.sessionTtlSeconds);
    if (!held) throw conflict('SESSION_NOT_OPEN', 'This payment session is no longer waiting for payment');

    try {
      return await this.transak.createWidgetUrl({
        walletAddress: held.payToAddress,
        fiatAmountUsd: formatUsd(held.amountUsdCents),
        partnerOrderId: held.id,
        referrerDomain: new URL(onramp.publicBaseUrl).host,
        userIp,
      });
    } catch (err) {
      logger.error({ err, sessionId }, 'could not create a Transak widget URL');
      throw unavailable(
        'ONRAMP_UNAVAILABLE',
        'Card payment is unavailable right now. Pay from a wallet, or try again shortly.',
      );
    }
  }

  async getSessionView(id: string): Promise<SessionView | null> {
    const session = await getSession(this.pool, id);
    if (!session) return null;
    const payments = await listActivePaymentsForSession(this.pool, session.id);
    return this.toView(session, payments);
  }

  /** Releases the reserved amounts of pending sessions past their deadline. */
  async sweepExpired(): Promise<Session[]> {
    const expired = await expirePendingSessions(this.pool);
    if (expired.length > 0) {
      logger.info({ count: expired.length }, 'expired pending sessions');
    }
    return expired;
  }

  toView(
    session: Session,
    payments: Array<{ txHash: string; blockNumber: bigint; amountUsdc: bigint; fromAddress: string }>,
  ): SessionView {
    const amountUsd = formatUsd(session.amountUsdCents);
    const amountUsdc = formatUsdc(session.amountUsdc);
    return {
      sessionId: session.id,
      merchantId: session.merchantId,
      orderRef: session.orderRef,
      status: session.status,
      amountUsd,
      amountUsdc,
      amountUsdcMicro: session.amountUsdc.toString(),
      receivedUsdc: formatUsdc(session.receivedUsdc),
      payToAddress: session.payToAddress,
      chainId: this.config.chain.chainId,
      token: { address: this.config.chain.usdcAddress, symbol: 'USDC', decimals: USDC_DECIMALS },
      paymentUri: buildPaymentUri({
        tokenAddress: this.config.chain.usdcAddress,
        chainId: this.config.chain.chainId,
        payToAddress: session.payToAddress,
        amountUsdcMicro: session.amountUsdc,
      }),
      priceUsd: session.usdcPriceUsd,
      priceStale: session.priceStale,
      confirmations: session.confirmations,
      confirmationsRequired: this.config.watcher.confirmationsRequired,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      settledAt: session.settledAt ? session.settledAt.toISOString() : null,
      transactions: payments.map((p) => ({
        txHash: p.txHash,
        blockNumber: p.blockNumber.toString(),
        amountUsdc: formatUsdc(p.amountUsdc),
        from: p.fromAddress,
      })),
      onramp: buildOnrampLink(this.config, {
        sessionId: session.id,
        payToAddress: session.payToAddress,
        amountUsd,
        amountUsdCents: session.amountUsdCents,
        amountUsdc,
      }),
    };
  }
}

/**
 * EIP-681 ERC-20 transfer request. Wallets that understand it prefill the
 * recipient and the exact amount, which is the whole point of the unique-amount
 * scheme — a buyer who retypes the amount by hand can get it wrong.
 */
export function buildPaymentUri(args: {
  tokenAddress: string;
  chainId: number;
  payToAddress: string;
  amountUsdcMicro: bigint;
}): string {
  return (
    `ethereum:${args.tokenAddress}@${args.chainId}/transfer` +
    `?address=${args.payToAddress}&uint256=${args.amountUsdcMicro.toString()}`
  );
}
