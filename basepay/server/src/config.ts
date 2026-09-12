import { z } from 'zod';

/** Canonical USDC on Base mainnet. 6 decimals. This service supports nothing else. */
export const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_DECIMALS = 6;
export const BASE_MAINNET_CHAIN_ID = 8453;

const bool = (dflt: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? dflt : v === 'true' || v === '1'));

const int = (dflt: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? dflt : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const num = (dflt: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? dflt : Number(v)))
    .pipe(z.number().min(min).max(max));

const str = (dflt: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? dflt : v));

const optionalStr = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v));

const envSchema = z.object({
  NODE_ENV: str('development'),
  PORT: int(8080, 1, 65535),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  LOG_LEVEL: str('info'),

  ADMIN_TOKEN: optionalStr,
  MERCHANTS_FILE: optionalStr,

  SESSION_TTL_SECONDS: int(900, 60, 86_400),
  AMOUNT_OFFSET_MAX: int(1000, 1, 1_000_000),
  UNDERPAY_MIN_RATIO: num(0.5, 0, 1),
  OVERPAY_MAX_RATIO: num(1.1, 1, 10),
  SESSION_RATE_LIMIT_PER_MINUTE: int(30, 1, 100_000),

  PRICE_CACHE_TTL_SECONDS: int(60, 1, 3600),
  PRICE_MAX_STALE_SECONDS: int(600, 60, 86_400),
  COINGECKO_BASE_URL: str('https://api.coingecko.com/api/v3'),
  COINGECKO_API_KEY: optionalStr,
  PRICE_REQUEST_TIMEOUT_MS: int(5000, 100, 60_000),

  CHAIN_ID: int(BASE_MAINNET_CHAIN_ID, 1, 2_147_483_647),
  USDC_ADDRESS: str(USDC_BASE_MAINNET),
  BASE_RPC_HTTP_URL: str('https://mainnet.base.org'),
  BASE_RPC_WS_URL: optionalStr,

  WATCHER_ENABLED: bool(true),
  WATCHER_POLL_INTERVAL_MS: int(4000, 250, 600_000),
  WATCHER_MAX_BLOCK_RANGE: int(500, 1, 10_000),
  WATCHER_START_BLOCK: optionalStr,
  CONFIRMATIONS_REQUIRED: int(3, 1, 200),
  REORG_DEPTH_BLOCKS: int(12, 1, 1000),

  WEBHOOKS_ENABLED: bool(true),
  WEBHOOK_MAX_ATTEMPTS: int(6, 1, 20),
  WEBHOOK_TIMEOUT_MS: int(10_000, 100, 120_000),
  WEBHOOK_WORKER_INTERVAL_MS: int(2000, 250, 600_000),
  WEBHOOK_BACKOFF_BASE_SECONDS: int(5, 1, 3600),

  EXPIRY_SWEEP_INTERVAL_MS: int(10_000, 250, 600_000),

  CORS_ALLOWED_ORIGINS: str('*'),
  SERVE_WIDGET: bool(true),
  WIDGET_DIST_DIR: optionalStr,
  WIDGET_DEMO_DIR: optionalStr,
  PUBLIC_BASE_URL: optionalStr,

  ONRAMP_PROVIDER: str('none').pipe(z.enum(['none', 'transak', 'moonpay'])),
  TRANSAK_API_KEY: optionalStr,
  TRANSAK_ENVIRONMENT: str('PRODUCTION').pipe(z.enum(['STAGING', 'PRODUCTION'])),
  MOONPAY_API_KEY: optionalStr,
});

export type Env = z.infer<typeof envSchema>;

export interface Config {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  adminToken: string | undefined;
  merchantsFile: string | undefined;
  sessions: {
    ttlSeconds: number;
    /** Exclusive upper bound on the micro-USDC offset added for attribution. */
    offsetMax: number;
    /**
     * A transfer smaller than the quote counts as an underpayment of that session
     * only if it is at least this fraction of the quote. Below it, the transfer is
     * recorded as unmatched rather than guessed onto a session.
     */
    underpayMinRatio: number;
    /**
     * A transfer larger than the quote settles that session only if it is at most
     * this multiple of it. Exists for the fiat on-ramp path, which cannot deliver
     * an exact amount. Both tolerance paths require an unambiguous candidate.
     */
    overpayMaxRatio: number;
    rateLimitPerMinute: number;
    expirySweepIntervalMs: number;
  };
  price: {
    cacheTtlSeconds: number;
    maxStaleSeconds: number;
    coingeckoBaseUrl: string;
    coingeckoApiKey: string | undefined;
    requestTimeoutMs: number;
  };
  chain: {
    chainId: number;
    usdcAddress: string;
    httpRpcUrl: string;
    wsRpcUrl: string | undefined;
  };
  watcher: {
    enabled: boolean;
    pollIntervalMs: number;
    maxBlockRange: number;
    startBlock: bigint | undefined;
    confirmationsRequired: number;
    reorgDepthBlocks: number;
  };
  webhooks: {
    enabled: boolean;
    maxAttempts: number;
    timeoutMs: number;
    workerIntervalMs: number;
    backoffBaseSeconds: number;
  };
  http: {
    corsAllowedOrigins: string[] | '*';
    serveWidget: boolean;
    widgetDistDir: string | undefined;
    widgetDemoDir: string | undefined;
    publicBaseUrl: string | undefined;
  };
  onramp:
    | { provider: 'none' }
    | { provider: 'transak'; apiKey: string; environment: 'STAGING' | 'PRODUCTION' }
    | { provider: 'moonpay'; apiKey: string };
}

function buildOnramp(env: Env): Config['onramp'] {
  switch (env.ONRAMP_PROVIDER) {
    case 'transak':
      if (!env.TRANSAK_API_KEY) {
        throw new Error('ONRAMP_PROVIDER=transak requires TRANSAK_API_KEY');
      }
      return { provider: 'transak', apiKey: env.TRANSAK_API_KEY, environment: env.TRANSAK_ENVIRONMENT };
    case 'moonpay':
      if (!env.MOONPAY_API_KEY) {
        throw new Error('ONRAMP_PROVIDER=moonpay requires MOONPAY_API_KEY');
      }
      return { provider: 'moonpay', apiKey: env.MOONPAY_API_KEY };
    case 'none':
      return { provider: 'none' };
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const env = parsed.data;

  if (env.PRICE_MAX_STALE_SECONDS < env.PRICE_CACHE_TTL_SECONDS) {
    throw new Error('PRICE_MAX_STALE_SECONDS must be >= PRICE_CACHE_TTL_SECONDS');
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(env.USDC_ADDRESS)) {
    throw new Error('USDC_ADDRESS must be a 20-byte hex address');
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    adminToken: env.ADMIN_TOKEN,
    merchantsFile: env.MERCHANTS_FILE,
    sessions: {
      ttlSeconds: env.SESSION_TTL_SECONDS,
      offsetMax: env.AMOUNT_OFFSET_MAX,
      underpayMinRatio: env.UNDERPAY_MIN_RATIO,
      overpayMaxRatio: env.OVERPAY_MAX_RATIO,
      rateLimitPerMinute: env.SESSION_RATE_LIMIT_PER_MINUTE,
      expirySweepIntervalMs: env.EXPIRY_SWEEP_INTERVAL_MS,
    },
    price: {
      cacheTtlSeconds: env.PRICE_CACHE_TTL_SECONDS,
      maxStaleSeconds: env.PRICE_MAX_STALE_SECONDS,
      coingeckoBaseUrl: env.COINGECKO_BASE_URL,
      coingeckoApiKey: env.COINGECKO_API_KEY,
      requestTimeoutMs: env.PRICE_REQUEST_TIMEOUT_MS,
    },
    chain: {
      chainId: env.CHAIN_ID,
      usdcAddress: env.USDC_ADDRESS,
      httpRpcUrl: env.BASE_RPC_HTTP_URL,
      wsRpcUrl: env.BASE_RPC_WS_URL,
    },
    watcher: {
      enabled: env.WATCHER_ENABLED,
      pollIntervalMs: env.WATCHER_POLL_INTERVAL_MS,
      maxBlockRange: env.WATCHER_MAX_BLOCK_RANGE,
      startBlock: env.WATCHER_START_BLOCK === undefined ? undefined : BigInt(env.WATCHER_START_BLOCK),
      confirmationsRequired: env.CONFIRMATIONS_REQUIRED,
      reorgDepthBlocks: env.REORG_DEPTH_BLOCKS,
    },
    webhooks: {
      enabled: env.WEBHOOKS_ENABLED,
      maxAttempts: env.WEBHOOK_MAX_ATTEMPTS,
      timeoutMs: env.WEBHOOK_TIMEOUT_MS,
      workerIntervalMs: env.WEBHOOK_WORKER_INTERVAL_MS,
      backoffBaseSeconds: env.WEBHOOK_BACKOFF_BASE_SECONDS,
    },
    http: {
      corsAllowedOrigins:
        env.CORS_ALLOWED_ORIGINS === '*'
          ? '*'
          : env.CORS_ALLOWED_ORIGINS.split(',')
              .map((o) => o.trim())
              .filter((o) => o.length > 0),
      serveWidget: env.SERVE_WIDGET,
      widgetDistDir: env.WIDGET_DIST_DIR,
      widgetDemoDir: env.WIDGET_DEMO_DIR,
      publicBaseUrl: env.PUBLIC_BASE_URL,
    },
    onramp: buildOnramp(env),
  };
}
