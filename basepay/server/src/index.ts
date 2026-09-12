import 'dotenv/config';
import { createApp } from './api/app.js';
import { loadConfig } from './config.js';
import { getMerchant } from './db/merchants.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { logger } from './logger.js';
import { seedMerchantsFromFile } from './merchants/seed.js';
import { fetchUsdcPriceUsd } from './price/coingecko.js';
import { PriceService } from './price/priceService.js';
import { SessionService } from './sessions/sessionService.js';
import { Watcher } from './watcher/watcher.js';
import { WebhookWorker } from './webhooks/dispatcher.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

await migrate(pool);

if (config.merchantsFile) {
  await seedMerchantsFromFile(pool, config.merchantsFile);
}

const priceService = new PriceService({
  fetchPrice: () =>
    fetchUsdcPriceUsd({
      baseUrl: config.price.coingeckoBaseUrl,
      apiKey: config.price.coingeckoApiKey,
      timeoutMs: config.price.requestTimeoutMs,
    }),
  cacheTtlSeconds: config.price.cacheTtlSeconds,
  maxStaleSeconds: config.price.maxStaleSeconds,
});

// Warm the price cache so the first checkout of the day is not the one that waits.
try {
  await priceService.getQuote();
} catch (err) {
  logger.warn({ err: (err as Error).message }, 'could not fetch an initial USDC price');
}

const sessionService = new SessionService(pool, config, priceService);

const watcher = config.watcher.enabled ? new Watcher(pool, config) : null;
if (watcher) await watcher.start();

const webhookWorker = new WebhookWorker(pool, config, async (merchantId) => {
  const merchant = await getMerchant(pool, merchantId);
  return merchant?.webhookSecret ?? null;
});
webhookWorker.start();

const expiryTimer = setInterval(() => {
  void sessionService.sweepExpired().catch((err) => logger.error({ err }, 'expiry sweep failed'));
}, config.sessions.expirySweepIntervalMs);
expiryTimer.unref?.();

const app = createApp({ config, pool, priceService, sessionService, watcher });
const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, chainId: config.chain.chainId, usdc: config.chain.usdcAddress },
    'BasePay API listening',
  );
});

/**
 * Graceful shutdown. The watcher's bookmark is already durable, so the worst a
 * hard kill costs is re-scanning the last few blocks on the next boot.
 */
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    clearInterval(expiryTimer);

    void (async () => {
      server.close();
      await Promise.allSettled([watcher?.stop(), webhookWorker.stop()]);
      await pool.end();
      process.exit(0);
    })();
  });
}
