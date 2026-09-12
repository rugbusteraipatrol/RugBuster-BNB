import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../../config.js';
import { badRequest, notFound } from '../../errors.js';
import type { SessionService } from '../../sessions/sessionService.js';
import { isUuid } from '../../uuid.js';
import { asyncRoute, rateLimitSessions } from '../middleware.js';

const createSessionSchema = z.object({
  merchantId: z.string().min(1).max(128),
  // Accepted as a JSON number or a string; both are converted to exact cents.
  amountUsd: z.union([z.number().positive().finite(), z.string().min(1).max(32)]),
  orderRef: z.string().min(1).max(256).optional(),
});

export function sessionRoutes(config: Config, sessions: SessionService): Router {
  const router = Router();

  router.post(
    '/sessions',
    rateLimitSessions(config),
    asyncRoute(async (req, res) => {
      const parsed = createSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('INVALID_REQUEST', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      const view = await sessions.createSession({
        merchantId: parsed.data.merchantId,
        amountUsd: parsed.data.amountUsd,
        orderRef: parsed.data.orderRef,
      });
      res.status(201).json(view);
    }),
  );

  router.get(
    '/sessions/:id',
    asyncRoute(async (req, res) => {
      const id = String(req.params['id'] ?? '');
      // Reject non-UUIDs before touching the database: `WHERE id = $1` on a uuid
      // column raises a type error otherwise, which would read as a 500.
      if (!isUuid(id)) throw notFound('SESSION_NOT_FOUND', 'No such payment session');

      const view = await sessions.getSessionView(id);
      if (!view) throw notFound('SESSION_NOT_FOUND', 'No such payment session');

      // Status changes constantly; never let a CDN or browser cache it.
      res.setHeader('cache-control', 'no-store');
      res.json(view);
    }),
  );

  return router;
}
