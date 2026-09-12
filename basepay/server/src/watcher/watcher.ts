import type pg from 'pg';
import type { Address, PublicClient } from 'viem';
import type { Config } from '../config.js';
import { listMerchantAddresses } from '../db/merchants.js';
import { getWatcherState, setWatcherState } from '../db/watcherState.js';
import { logger } from '../logger.js';
import { createChainClient } from './chainClient.js';
import { TRANSFER_EVENT, watcherStateId } from './constants.js';
import { Settlement, type ObservedTransfer } from './settlement.js';

export interface WatcherStatus {
  enabled: boolean;
  transport: string;
  lastProcessedBlock: string | null;
  headBlock: string | null;
  lastTickAt: string | null;
  lastError: string | null;
}

/**
 * Watches USDC Transfer events into merchant addresses on Base.
 *
 * One code path handles live blocks and backfill: every tick asks the chain for
 * its head, scans forward from the persisted bookmark, and persists the new
 * bookmark. A restart therefore resumes exactly where it stopped — the service
 * being down delays settlement, it never loses a payment.
 *
 * Each tick also re-scans the last REORG_DEPTH_BLOCKS blocks and re-checks the
 * block hashes of transfers recorded there. Re-scanning is safe because
 * recording a transfer is idempotent on (tx_hash, log_index).
 */
export class Watcher {
  private readonly client: PublicClient;
  private readonly settlement: Settlement;
  private readonly stateId: string;
  private readonly transport: string;

  private unwatchBlocks: (() => void) | null = null;
  private safetyTimer: NodeJS.Timeout | null = null;
  private ticking = false;
  // Only stop() sets this. A Watcher that was never started can still be
  // ticked directly, which is how tests and one-shot backfills drive it.
  private stopped = false;
  private status: WatcherStatus;

  constructor(
    private readonly pool: pg.Pool,
    private readonly config: Config,
    client?: PublicClient,
  ) {
    const chain = client ? null : createChainClient(config);
    this.client = client ?? (chain?.client as PublicClient);
    this.transport = chain?.transport ?? 'injected';
    this.settlement = new Settlement(pool, config);
    this.stateId = watcherStateId(config.chain.chainId, config.chain.usdcAddress);
    this.status = {
      enabled: config.watcher.enabled,
      transport: this.transport,
      lastProcessedBlock: null,
      headBlock: null,
      lastTickAt: null,
      lastError: null,
    };
  }

  getStatus(): WatcherStatus {
    return { ...this.status };
  }

  /**
   * New-head notifications drive the ticks (a WebSocket subscription when the
   * RPC supports it, viem's polling otherwise). The safety interval is a belt
   * for when the subscription silently stalls.
   */
  async start(): Promise<void> {
    if (!this.config.watcher.enabled) {
      logger.warn('watcher disabled by configuration; sessions will never settle');
      return;
    }
    this.stopped = false;
    await this.tick();

    // `poll` is deliberately left to viem: it subscribes over WebSocket when the
    // transport supports it and polls otherwise, which is exactly the intent.
    this.unwatchBlocks = this.client.watchBlockNumber({
      emitOnBegin: false,
      pollingInterval: this.config.watcher.pollIntervalMs,
      onBlockNumber: () => {
        void this.tick();
      },
      onError: (err) => {
        logger.warn({ err: err.message }, 'block subscription error');
      },
    });

    this.safetyTimer = setInterval(() => {
      void this.tick();
    }, Math.max(this.config.watcher.pollIntervalMs * 5, 15_000));
    this.safetyTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.unwatchBlocks?.();
    this.unwatchBlocks = null;
    if (this.safetyTimer) {
      clearInterval(this.safetyTimer);
      this.safetyTimer = null;
    }
    while (this.ticking) await new Promise((resolve) => setTimeout(resolve, 25));
  }

  /** One full pass. Exposed so integration tests can drive the watcher deterministically. */
  async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      const head = await this.client.getBlockNumber();
      this.status.headBlock = head.toString();

      const from = await this.resolveScanStart(head);
      const addresses = await listMerchantAddresses(this.pool);

      // Re-validate first: drop transfers that left the canonical chain before
      // re-scanning, so a re-included transfer is re-recorded in the same tick.
      await this.settlement.revalidateFromBlock(from, (blockNumber) => this.blockHashAt(blockNumber));

      if (addresses.length > 0) {
        await this.scanRange(from, head, addresses as Address[]);
      } else {
        await this.saveBookmark(head);
      }

      await this.settlement.advanceConfirmations(head);

      this.status.lastProcessedBlock = head.toString();
      this.status.lastTickAt = new Date().toISOString();
      this.status.lastError = null;
    } catch (err) {
      this.status.lastError = (err as Error).message;
      logger.error({ err }, 'watcher tick failed');
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Where this tick starts scanning: the persisted bookmark rewound by the reorg
   * depth. On a cold start with no bookmark we use WATCHER_START_BLOCK if set,
   * otherwise the current head — a fresh deployment has no older sessions to settle.
   */
  private async resolveScanStart(head: bigint): Promise<bigint> {
    const state = await getWatcherState(this.pool, this.stateId);
    const depth = BigInt(this.config.watcher.reorgDepthBlocks);

    if (!state) {
      const start = this.config.watcher.startBlock ?? head;
      logger.info({ startBlock: start.toString() }, 'watcher cold start');
      return start > head ? head : start;
    }

    const rewound = state.lastProcessedBlock > depth ? state.lastProcessedBlock - depth + 1n : 0n;
    return rewound > head ? head : rewound;
  }

  private async scanRange(from: bigint, to: bigint, addresses: Address[]): Promise<void> {
    const chunk = BigInt(this.config.watcher.maxBlockRange);
    for (let start = from; start <= to; start += chunk) {
      const end = start + chunk - 1n > to ? to : start + chunk - 1n;

      const logs = await this.client.getLogs({
        address: this.config.chain.usdcAddress as Address,
        event: TRANSFER_EVENT,
        args: { to: addresses },
        fromBlock: start,
        toBlock: end,
      });

      for (const log of logs) {
        const transfer = toObservedTransfer(log);
        if (!transfer) continue;
        await this.settlement.applyTransfer(transfer);
      }

      if (logs.length > 0) {
        logger.info({ from: start.toString(), to: end.toString(), transfers: logs.length }, 'scanned transfers');
      }
      await this.saveBookmark(end);
    }
  }

  private async saveBookmark(block: bigint): Promise<void> {
    const hash = await this.blockHashAt(block);
    await setWatcherState(this.pool, this.stateId, block, hash);
  }

  private async blockHashAt(blockNumber: bigint): Promise<string | null> {
    try {
      const block = await this.client.getBlock({ blockNumber });
      return block.hash ?? null;
    } catch (err) {
      logger.debug({ blockNumber: blockNumber.toString(), err: (err as Error).message }, 'block lookup failed');
      return null;
    }
  }
}

type TransferLog = {
  transactionHash: string | null;
  logIndex: number | null;
  blockNumber: bigint | null;
  blockHash: string | null;
  args: { from?: string | undefined; to?: string | undefined; value?: bigint | undefined };
};

/**
 * Converts a viem log into a settlement input. Pending logs (null block fields)
 * are skipped: an unmined transfer has no position in the chain to reorg-check
 * against, so it is not money we can count yet.
 */
export function toObservedTransfer(log: TransferLog): ObservedTransfer | null {
  const { transactionHash, logIndex, blockNumber, blockHash, args } = log;
  if (
    transactionHash === null ||
    logIndex === null ||
    blockNumber === null ||
    blockHash === null ||
    args.from === undefined ||
    args.to === undefined ||
    args.value === undefined
  ) {
    return null;
  }
  return {
    txHash: transactionHash,
    logIndex,
    blockNumber,
    blockHash,
    from: args.from,
    to: args.to,
    value: args.value,
  };
}
