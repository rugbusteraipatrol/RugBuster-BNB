import { Router } from 'express';
import type pg from 'pg';
import type { Config } from '../../config.js';
import type { PriceService } from '../../price/priceService.js';
import { redactUrls } from '../../redact.js';
import type { Watcher } from '../../watcher/watcher.js';
import { asyncRoute } from '../middleware.js';

export function healthRoutes(config: Config, pool: pg.Pool, price: PriceService, watcher: Watcher | null): Router {
  const router = Router();

  /** Liveness: the process is up. Never touches dependencies. */
  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', chainId: config.chain.chainId, usdc: config.chain.usdcAddress });
  });

  /**
   * Readiness: can this instance actually quote and settle payments right now?
   * A stale price feed or a stalled watcher is reported rather than hidden.
   */
  router.get(
    '/readyz',
    asyncRoute(async (_req, res) => {
      const checks: Record<string, unknown> = {};
      let ready = true;

      try {
        await pool.query('SELECT 1');
        checks['database'] = { ok: true };
      } catch (err) {
        ready = false;
        checks['database'] = { ok: false, error: redactUrls((err as Error).message) };
      }

      const snapshot = price.snapshot();
      const priceOk = snapshot !== null && snapshot.ageSeconds <= config.price.maxStaleSeconds;
      if (!priceOk) ready = false;
      checks['price'] = snapshot
        ? { ok: priceOk, priceUsd: snapshot.priceUsd, ageSeconds: Math.round(snapshot.ageSeconds) }
        : { ok: false, error: 'no price fetched yet' };

      if (watcher) {
        const status = watcher.getStatus();
        if (!status.ok) ready = false;
        checks['watcher'] = status;
      } else {
        checks['watcher'] = { enabled: false };
      }

      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
    }),
  );

  return router;
}
