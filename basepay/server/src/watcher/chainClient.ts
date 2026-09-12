import { createPublicClient, defineChain, fallback, http, webSocket, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import type { Config } from '../config.js';
import { logger } from '../logger.js';

export interface ChainClient {
  client: PublicClient;
  /** Which transport the watcher ended up with; surfaced on /healthz. */
  transport: 'websocket+http' | 'http';
}

/**
 * Base mainnet when the configured chain id says so, otherwise a synthetic chain
 * (local anvil in dev and integration tests). No other production chain is
 * supported and none is abstracted for.
 */
function resolveChain(config: Config) {
  if (config.chain.chainId === base.id) return base;
  return defineChain({
    id: config.chain.chainId,
    name: `chain-${config.chain.chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.chain.httpRpcUrl] } },
  });
}

/**
 * Prefers the WebSocket RPC and falls back to HTTP automatically when it is
 * unavailable or drops. The watcher's correctness never depends on which one is
 * live: both paths feed the same `getLogs` range scan, and the bookmark in
 * `watcher_state` is what guarantees nothing is missed.
 */
export function createChainClient(config: Config): ChainClient {
  const chain = resolveChain(config);
  const httpTransport = http(config.chain.httpRpcUrl, { retryCount: 3, timeout: 20_000 });

  if (config.chain.wsRpcUrl) {
    logger.info({ url: redactUrl(config.chain.wsRpcUrl) }, 'watcher using WebSocket RPC with HTTP fallback');
    return {
      client: createPublicClient({
        chain,
        transport: fallback([webSocket(config.chain.wsRpcUrl, { retryCount: 3 }), httpTransport]),
        pollingInterval: config.watcher.pollIntervalMs,
      }) as PublicClient,
      transport: 'websocket+http',
    };
  }

  logger.info({ url: redactUrl(config.chain.httpRpcUrl) }, 'watcher using HTTP RPC polling');
  return {
    client: createPublicClient({
      chain,
      transport: httpTransport,
      pollingInterval: config.watcher.pollIntervalMs,
    }) as PublicClient,
    transport: 'http',
  };
}

/** RPC URLs routinely carry an API key in the path. Keep them out of logs. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '[unparseable url]';
  }
}
