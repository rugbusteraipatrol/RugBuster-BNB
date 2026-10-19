import type { Config } from '../config.js';
import { getMerchant, setMerchantPlan } from '../db/merchants.js';
import type { Queryable } from '../db/pool.js';
import type { Session } from '../db/types.js';
import { logger } from '../logger.js';

const DAY_MS = 86_400_000;

/** Order ref a Pro payment carries: `PRO-{merchantId}`. */
export const proOrderRef = (merchantId: string): string => `PRO-${merchantId}`;

/**
 * Pro is paid for with BasePay itself: a session for the billing merchant,
 * order ref `PRO-{merchantId}`, at least the Pro price. When it settles, the
 * named merchant gets `pro` for another period, stacked on any time it still
 * has. The money goes to the operator's wallet like any other payment; this
 * only flips the plan.
 *
 * Anyone can open a session for any merchant at any amount, so the amount
 * check is what makes this safe: a one-cent "PRO-" session buys nothing.
 */
export async function applyProPayment(db: Queryable, config: Config, session: Session): Promise<boolean> {
  const billing = config.billing;
  if (!billing.merchantId || session.merchantId !== billing.merchantId) return false;
  const match = /^PRO-(.+)$/.exec(session.orderRef ?? '');
  if (!match?.[1]) return false;

  const merchantId = match[1];
  if (session.amountUsdCents < BigInt(billing.proPriceUsdCents)) {
    logger.warn({ sessionId: session.id, merchantId, amountUsdCents: session.amountUsdCents.toString() }, 'Pro payment below the Pro price; plan unchanged');
    return false;
  }
  const merchant = await getMerchant(db, merchantId);
  if (!merchant) {
    logger.warn({ sessionId: session.id, merchantId }, 'Pro payment for an unknown merchant; plan unchanged');
    return false;
  }

  const now = Date.now();
  const current = merchant.plan === 'pro' && merchant.planExpiresAt ? merchant.planExpiresAt.getTime() : now;
  // A Pro plan with no expiry (granted by an operator) stays open-ended.
  if (merchant.plan === 'pro' && merchant.planExpiresAt === null) return true;
  const expiresAt = new Date(Math.max(current, now) + billing.proPeriodDays * DAY_MS);
  await setMerchantPlan(db, merchantId, 'pro', expiresAt);
  logger.info({ merchantId, sessionId: session.id, expiresAt: expiresAt.toISOString() }, 'Pro plan paid');
  return true;
}
