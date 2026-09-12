import type { SessionView } from './types.js';

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }
}

export class WalletError extends Error {
  constructor(
    readonly kind: 'no-wallet' | 'rejected' | 'wrong-network' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export function detectProvider(): Eip1193Provider | null {
  const injected = window.ethereum;
  if (!injected) return null;
  // Several wallets installed side by side expose an array; any of them can pay.
  if (Array.isArray(injected.providers) && injected.providers[0]) return injected.providers[0];
  return injected;
}

/** keccak256("transfer(address,uint256)")[0:4] */
const TRANSFER_SELECTOR = 'a9059cbb';

/**
 * Encodes `transfer(address,uint256)` by hand rather than pulling in an ABI
 * coder. One function, two static-size arguments — a library would be more code
 * than the thing it encodes.
 */
export function encodeTransfer(to: string, amountMicroUnits: string): string {
  const address = to.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(address)) throw new Error('invalid recipient address');
  const amount = BigInt(amountMicroUnits);
  if (amount <= 0n) throw new Error('amount must be positive');
  return `0x${TRANSFER_SELECTOR}${address.padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
}

export const toHexChainId = (chainId: number): string => `0x${chainId.toString(16)}`;

const BASE_MAINNET = {
  chainId: '0x2105',
  chainName: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
};

function providerErrorCode(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'number' ? code : null;
}

/** EIP-1193: 4001 is "user rejected request". */
const USER_REJECTED = 4001;
/** EIP-3085/3326: the chain is not known to the wallet yet. */
const CHAIN_NOT_ADDED = 4902;

async function ensureNetwork(provider: Eip1193Provider, chainId: number): Promise<void> {
  const current = (await provider.request({ method: 'eth_chainId' })) as string;
  const target = toHexChainId(chainId);
  if (typeof current === 'string' && current.toLowerCase() === target.toLowerCase()) return;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target }] });
  } catch (err) {
    const code = providerErrorCode(err);
    if (code === USER_REJECTED) {
      throw new WalletError('rejected', 'You declined the network switch. Payment needs the Base network.');
    }
    if (code === CHAIN_NOT_ADDED && chainId === 8453) {
      try {
        await provider.request({ method: 'wallet_addEthereumChain', params: [BASE_MAINNET] });
        return;
      } catch (addErr) {
        const addCode = providerErrorCode(addErr);
        if (addCode === USER_REJECTED) {
          throw new WalletError('rejected', 'You declined adding the Base network.');
        }
      }
    }
    throw new WalletError('wrong-network', 'Could not switch your wallet to Base. Switch networks manually and try again.');
  }
}

/**
 * Sends the exact quoted amount of USDC to the merchant. Returns the transaction
 * hash; settlement is confirmed by the backend watching the chain, never by
 * trusting this return value.
 */
export async function payWithWallet(session: SessionView): Promise<string> {
  const provider = detectProvider();
  if (!provider) {
    throw new WalletError('no-wallet', 'No crypto wallet was found in this browser.');
  }

  let accounts: string[];
  try {
    accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  } catch (err) {
    if (providerErrorCode(err) === USER_REJECTED) {
      throw new WalletError('rejected', 'You declined the connection request.');
    }
    throw new WalletError('failed', 'Could not connect to your wallet.');
  }

  const from = accounts[0];
  if (!from) throw new WalletError('failed', 'Your wallet did not return an account.');

  await ensureNetwork(provider, session.chainId);

  try {
    const txHash = (await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from,
          to: session.token.address,
          data: encodeTransfer(session.payToAddress, session.amountUsdcMicro),
          value: '0x0',
        },
      ],
    })) as string;
    return txHash;
  } catch (err) {
    if (providerErrorCode(err) === USER_REJECTED) {
      throw new WalletError('rejected', 'You cancelled the payment in your wallet.');
    }
    const message = typeof err === 'object' && err !== null ? String((err as { message?: unknown }).message ?? '') : '';
    if (/insufficient/i.test(message)) {
      throw new WalletError('failed', 'Your wallet does not have enough USDC or ETH for gas on Base.');
    }
    throw new WalletError('failed', 'The payment could not be sent. Check your wallet and try again.');
  }
}
