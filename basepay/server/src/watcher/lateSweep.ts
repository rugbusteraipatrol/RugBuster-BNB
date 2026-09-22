import type pg from 'pg';
import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import type { Config } from '../config.js';
import { listAddressesWithRecentlyExpiredSessions } from '../db/sessions.js';
import { getWatcherState, setWatcherState } from '../db/watcherState.js';
import { logger } from '../logger.js';
import { TRANSFER_EVENT } from './constants.js';
import { Settlement } from './settlement.js';
import { toObservedTransfer } from './watcher.js';

/** Base produces a block every two seconds; used only to size the first look-back. */
const BASE_BLOCK_SECONDS = 2;

export const lateSweepStateId = (chainId: number, tokenAddress: string): string =>
  `late-payments:${chainId}:${tokenAddress.toLowerCase()}`;

/**
 * Finds payments that arrived after their quote expired.
 *
 * The live watcher stops caring about a session the moment it expires, and it
 * runs on a metered RPC. This sweep runs on a separate, free endpoint, every
 * couple of minutes, and only while some session expired inside the window —
 * so an idle shop costs one head lookup per interval and nothing on the main
 * provider. It scans blocks that already have the required confirmations, so a
 * revived session is promoted to `paid` by the watcher's next pass.
 */
export class LateSweep {
  private readonly client: PublicClient;
  private readonly settlement: Settlement;
  private readonly stateId: string;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly config: Config,
    client?: PublicClient,
  ) {
    this.client =
      client ??
      (createPublicClient({
        chain: config.chain.chainId === base.id ? base : undefined,
        transport: http(config.latePayments.rpcUrl, { retryCount: 2, timeout: 20_000 }),
        cacheTime: 0,
      }) as PublicClient);
    this.settlement = new Settlement(pool, config);
    this.stateId = lateSweepStateId(config.chain.chainId, config.chain.usdcAddress);
  }

  start(): void {
    if (this.config.latePayments.windowSeconds <= 0) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.config.latePayments.sweepIntervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 25));
  }

  /** One pass. Returns how many sessions were revived. Exposed for tests. */
  async tick(): Promise<number> {
    const windowSeconds = this.config.latePayments.windowSeconds;
    if (this.running || windowSeconds <= 0) return 0;
    this.running = true;
    try {
      const head = await this.client.getBlockNumber();
      const depth = BigInt(Math.max(this.config.watcher.confirmationsRequired - 1, 0));
      const safeHead = head > depth ? head - depth : 0n;

      const state = await getWatcherState(this.pool, this.stateId);
      const lookBack = BigInt(Math.ceil(windowSeconds / BASE_BLOCK_SECONDS));
      let from = state ? state.lastProcessedBlock + 1n : safeHead > lookBack ? safeHead - lookBack : 0n;

      const addresses = await listAddressesWithRecentlyExpiredSessions(this.pool, windowSeconds);
      if (addresses.length === 0 || from > safeHead) {
        await setWatcherState(this.pool, this.stateId, safeHead, null);
        return 0;
      }

      let revived = 0;
      const chunk = BigInt(this.config.latePayments.blockRange);
      const blockTimes = new Map<bigint, Date>();
      for (; from <= safeHead; from += chunk) {
        const to = from + chunk - 1n > safeHead ? safeHead : from + chunk - 1n;
        const logs = await this.client.getLogs({
          address: this.config.chain.usdcAddress as Address,
          event: TRANSFER_EVENT,
          args: { to: addresses as Address[] },
          fromBlock: from,
          toBlock: to,
        });
        for (const log of logs) {
          const transfer = toObservedTransfer(log);
          if (!transfer) continue;
          let blockTime = blockTimes.get(transfer.blockNumber);
          if (!blockTime) {
            const block = await this.client.getBlock({ blockNumber: transfer.blockNumber });
            blockTime = new Date(Number(block.timestamp) * 1000);
            blockTimes.set(transfer.blockNumber, blockTime);
          }
          const outcome = await this.settlement.applyLateTransfer(transfer, blockTime);
          if (outcome.kind === 'revived') revived += 1;
        }
        await setWatcherState(this.pool, this.stateId, to, null);
      }
      return revived;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'late-payment sweep failed; will retry');
      return 0;
    } finally {
      this.running = false;
    }
  }
}
