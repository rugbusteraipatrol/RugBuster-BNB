import { randomUUID } from 'node:crypto';
import type { PublicClient } from 'viem';

interface FakeLog {
  address: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  args: { from: string; to: string; value: bigint };
}

interface FakeBlock {
  number: bigint;
  hash: string;
  logs: FakeLog[];
}

export interface PendingTransfer {
  to: string;
  value: bigint;
  from?: string;
  txHash?: string;
}

/**
 * An in-memory chain that answers the three RPC calls the watcher makes:
 * getBlockNumber, getLogs and getBlock.
 *
 * It exists so the watcher's own logic — backfill from the bookmark, range
 * chunking, the re-scan window, reorg re-validation — can be tested
 * deterministically, including the cases a real chain will not reproduce on
 * demand. The anvil suite covers the same loop against real RPC and a real token.
 */
export class FakeChain {
  private readonly blocks: FakeBlock[] = [];
  private logCounter = 0;
  calls = { getLogs: 0, getBlock: 0, getBlockNumber: 0 };

  constructor(readonly tokenAddress: string, startHeight = 0) {
    for (let i = 0; i <= startHeight; i += 1) this.mine();
  }

  get head(): bigint {
    return BigInt(this.blocks.length - 1);
  }

  /** Appends a block containing the given transfers. Returns its number. */
  mine(transfers: PendingTransfer[] = []): bigint {
    const number = BigInt(this.blocks.length);
    const hash = `0x${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 66);
    this.blocks.push({
      number,
      hash,
      logs: transfers.map((t) => {
        this.logCounter += 1;
        return {
          address: this.tokenAddress,
          transactionHash: t.txHash ?? `0x${randomUUID().replace(/-/g, '').padEnd(64, '1')}`.slice(0, 66),
          logIndex: this.logCounter,
          blockNumber: number,
          blockHash: hash,
          args: { from: t.from ?? '0x00000000000000000000000000000000000000ff', to: t.to, value: t.value },
        };
      }),
    });
    return number;
  }

  /**
   * Replaces every block from `fromBlock` onward with new ones (new hashes),
   * optionally re-including some transfers. Same height, different history.
   */
  reorgFrom(fromBlock: bigint, replacement: PendingTransfer[][] = []): void {
    const dropped = this.blocks.length - Number(fromBlock);
    this.blocks.length = Number(fromBlock);
    for (let i = 0; i < Math.max(dropped, replacement.length); i += 1) {
      this.mine(replacement[i] ?? []);
    }
  }

  blockHashAt(blockNumber: bigint): string | undefined {
    return this.blocks[Number(blockNumber)]?.hash;
  }

  /** A structural stand-in for viem's PublicClient, limited to what the watcher uses. */
  asClient(): PublicClient {
    // Arrow properties so the fake keeps this chain's state without aliasing `this`.
    const client = {
      getBlockNumber: async (): Promise<bigint> => {
        this.calls.getBlockNumber += 1;
        return this.head;
      },

      getLogs: async (args: {
        address: string;
        args?: { to?: readonly string[] };
        fromBlock: bigint;
        toBlock: bigint;
      }): Promise<FakeLog[]> => {
        this.calls.getLogs += 1;
        if (args.fromBlock > args.toBlock) throw new Error('fromBlock after toBlock');

        const recipients = new Set((args.args?.to ?? []).map((a) => a.toLowerCase()));
        const matched: FakeLog[] = [];
        for (let n = args.fromBlock; n <= args.toBlock; n += 1n) {
          const block = this.blocks[Number(n)];
          if (!block) continue;
          for (const log of block.logs) {
            if (log.address.toLowerCase() !== args.address.toLowerCase()) continue;
            if (recipients.size > 0 && !recipients.has(log.args.to.toLowerCase())) continue;
            matched.push(log);
          }
        }
        return matched;
      },

      getBlock: async (args: { blockNumber: bigint }): Promise<{ hash: string; number: bigint }> => {
        this.calls.getBlock += 1;
        const block = this.blocks[Number(args.blockNumber)];
        if (!block) throw new Error(`block ${args.blockNumber} not found`);
        return { hash: block.hash, number: block.number };
      },

      // The tests drive `tick()` directly, so no subscription is needed.
      watchBlockNumber: (): (() => void) => () => undefined,
    };
    return client as unknown as PublicClient;
  }
}
