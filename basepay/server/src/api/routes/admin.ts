import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { normalizeAddress } from '../../address.js';
import type { Config } from '../../config.js';
import { listMerchants, upsertMerchant } from '../../db/merchants.js';
import { listUnmatchedPayments } from '../../db/payments.js';
import { listDeadLetters, listDeliveriesForSession } from '../../db/webhookDeliveries.js';
import { badRequest } from '../../errors.js';
import { formatUsdc } from '../../sessions/amounts.js';
import { isUuid } from '../../uuid.js';
import { asyncRoute, requireAdmin } from '../middleware.js';

const merchantSchema = z.object({
  merchantId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/, 'must be alphanumeric with . _ -'),
  walletAddress: z.string(),
  webhookUrl: z.string().url().max(2048).optional(),
  webhookSecret: z.string().min(16).max(256).optional(),
});

/**
 * Minimal operator surface behind a bearer token. Deliberately not a dashboard:
 * merchant onboarding, plus the two views an operator actually needs when
 * something looks wrong (money that could not be attributed, and webhooks that
 * gave up).
 */
export function adminRoutes(config: Config, pool: pg.Pool): Router {
  const router = Router();
  router.use(requireAdmin(config));

  router.get(
    '/merchants',
    asyncRoute(async (_req, res) => {
      const merchants = await listMerchants(pool);
      res.json({
        merchants: merchants.map((m) => ({
          merchantId: m.id,
          walletAddress: m.walletAddress,
          webhookUrl: m.webhookUrl,
          // Never echo the secret back, not even to an authenticated operator.
          webhookConfigured: m.webhookSecret !== null,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    }),
  );

  router.post(
    '/merchants',
    asyncRoute(async (req, res) => {
      const parsed = merchantSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('INVALID_REQUEST', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      const { merchantId, walletAddress, webhookUrl, webhookSecret } = parsed.data;
      if ((webhookUrl === undefined) !== (webhookSecret === undefined)) {
        throw badRequest('INVALID_REQUEST', 'webhookUrl and webhookSecret must be provided together');
      }

      const merchant = await upsertMerchant(pool, {
        id: merchantId,
        walletAddress: normalizeAddress(walletAddress, 'walletAddress'),
        webhookUrl: webhookUrl ?? null,
        webhookSecret: webhookSecret ?? null,
      });

      res.status(201).json({
        merchantId: merchant.id,
        walletAddress: merchant.walletAddress,
        webhookUrl: merchant.webhookUrl,
        webhookConfigured: merchant.webhookSecret !== null,
      });
    }),
  );

  router.get(
    '/payments/unmatched',
    asyncRoute(async (_req, res) => {
      const payments = await listUnmatchedPayments(pool);
      res.json({
        payments: payments.map((p) => ({
          txHash: p.txHash,
          logIndex: p.logIndex,
          blockNumber: p.blockNumber.toString(),
          from: p.fromAddress,
          to: p.toAddress,
          amountUsdc: formatUsdc(p.amountUsdc),
          observedAt: p.observedAt.toISOString(),
        })),
      });
    }),
  );

  router.get(
    '/webhooks/dead-letters',
    asyncRoute(async (_req, res) => {
      const dead = await listDeadLetters(pool);
      res.json({
        deliveries: dead.map((d) => ({
          id: d.id,
          merchantId: d.merchantId,
          sessionId: d.sessionId,
          eventType: d.eventType,
          url: d.url,
          attempts: d.attempts,
          lastError: d.lastError,
          lastStatusCode: d.lastStatusCode,
          updatedAt: d.updatedAt.toISOString(),
        })),
      });
    }),
  );

  router.get(
    '/sessions/:id/webhooks',
    asyncRoute(async (req, res) => {
      const sessionId = String(req.params['id'] ?? '');
      if (!isUuid(sessionId)) throw badRequest('INVALID_REQUEST', 'session id must be a uuid');
      const deliveries = await listDeliveriesForSession(pool, sessionId);
      res.json({
        deliveries: deliveries.map((d) => ({
          id: d.id,
          eventType: d.eventType,
          status: d.status,
          attempts: d.attempts,
          lastError: d.lastError,
          lastStatusCode: d.lastStatusCode,
          nextAttemptAt: d.nextAttemptAt.toISOString(),
          deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
        })),
      });
    }),
  );

  return router;
}
