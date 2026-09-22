import type { Merchant, MerchantPlan } from '../db/types.js';

/**
 * The plan a merchant is actually on right now. A `pro` row whose
 * `plan_expires_at` has passed is treated as free again; the row is left alone
 * so an operator can see what lapsed.
 */
export function effectivePlan(merchant: Pick<Merchant, 'plan' | 'planExpiresAt'>, now = new Date()): MerchantPlan {
  if (merchant.plan !== 'pro') return 'free';
  if (merchant.planExpiresAt && merchant.planExpiresAt.getTime() <= now.getTime()) return 'free';
  return 'pro';
}

/** First instant of the current calendar month, UTC. Usage resets here. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * A merchant id derived from the shop's host, or from the name someone selling
 * through payment links typed, so operators can read the merchant list without
 * a lookup table: `kaseta-shop-k3n9x`. The suffix keeps two similar ones apart.
 */
export function merchantIdFor(siteUrlOrName: string | null, suffix: string): string {
  let host = 'shop';
  if (siteUrlOrName) {
    try {
      host = new URL(siteUrlOrName).hostname.replace(/^www\./, '');
    } catch {
      host = siteUrlOrName;
    }
  }
  const slug = host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'shop'}-${suffix}`;
}
