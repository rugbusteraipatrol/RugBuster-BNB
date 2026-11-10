import { parseAbiItem } from 'viem';

/** The only event this service cares about. USDC is a standard ERC-20 here. */
export const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** watcher_state row id. One row per (chain, token) pair. */
export const watcherStateId = (chainId: number, tokenAddress: string): string =>
  `usdc-transfers:${chainId}:${tokenAddress.toLowerCase()}`;
