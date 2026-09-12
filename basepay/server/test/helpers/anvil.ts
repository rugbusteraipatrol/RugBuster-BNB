import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  publicActions,
  walletActions,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const require = createRequire(import.meta.url);
const mockUsdc = require('../fixtures/MockUSDC.json') as { abi: unknown[]; bytecode: Hex };

/** anvil's deterministic dev accounts. */
export const ANVIL_ACCOUNTS = {
  deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex,
  buyer: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex,
} as const;

export const ANVIL_CHAIN_ID = 31337;

export function anvilAvailable(): boolean {
  try {
    return spawnSync('anvil', ['--version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

export const anvilChain = (rpcUrl: string) =>
  defineChain({
    id: ANVIL_CHAIN_ID,
    name: 'anvil',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export interface AnvilHandle {
  rpcUrl: string;
  stop: () => Promise<void>;
}

/**
 * Starts a local anvil. `forkUrl` forks a live chain (the watcher then runs
 * against the real USDC contract); without it anvil starts empty and the tests
 * deploy a stand-in token.
 */
export async function startAnvil(options: { forkUrl?: string | undefined } = {}): Promise<AnvilHandle> {
  const port = await freePort();
  const args = ['--port', String(port), '--host', '127.0.0.1', '--chain-id', String(ANVIL_CHAIN_ID), '--silent'];
  if (options.forkUrl) args.push('--fork-url', options.forkUrl);

  const child: ChildProcess = spawn('anvil', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const rpcUrl = `http://127.0.0.1:${port}`;
  const client = createPublicClient({ chain: anvilChain(rpcUrl), transport: http(rpcUrl) });

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`anvil exited with code ${child.exitCode}: ${stderr}`);
    }
    try {
      await client.getBlockNumber();
      break;
    } catch {
      if (Date.now() > deadline) {
        child.kill('SIGKILL');
        throw new Error(`anvil did not become ready within 60s: ${stderr}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return {
    rpcUrl,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      }),
  };
}

export const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function mint(address to, uint256 value)',
  'function decimals() view returns (uint8)',
]);

export function walletFor(privateKey: Hex, rpcUrl: string) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: anvilChain(rpcUrl),
    transport: http(rpcUrl),
  }).extend(publicActions);
}

export function publicFor(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: anvilChain(rpcUrl), transport: http(rpcUrl) }) as PublicClient;
}

export function testClientFor(rpcUrl: string) {
  return createTestClient({ chain: anvilChain(rpcUrl), mode: 'anvil', transport: http(rpcUrl) })
    .extend(publicActions)
    .extend(walletActions);
}

/** Deploys the 6-decimal stand-in token and mints `supply` to `holder`. */
export async function deployMockUsdc(rpcUrl: string, holder: Address, supply: bigint): Promise<Address> {
  const wallet = walletFor(ANVIL_ACCOUNTS.deployer, rpcUrl);
  const hash = await wallet.deployContract({
    abi: mockUsdc.abi as never,
    bytecode: mockUsdc.bytecode,
    args: [],
  });
  const receipt = await wallet.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;
  if (!address) throw new Error('MockUSDC deployment produced no address');

  const mint = await wallet.writeContract({
    address,
    abi: ERC20_ABI,
    functionName: 'mint',
    args: [holder, supply],
  });
  await wallet.waitForTransactionReceipt({ hash: mint });
  return address;
}

/**
 * Finds the storage slot of an ERC-20's balance mapping by writing a probe value
 * and checking whether `balanceOf` reports it.
 *
 * Used only in fork mode, to fund a test account with real USDC. Probing beats
 * hardcoding a slot number: it fails loudly if the token's layout ever changes,
 * instead of silently funding nothing.
 */
export async function fundErc20ViaStorage(
  rpcUrl: string,
  token: Address,
  holder: Address,
  amount: bigint,
): Promise<void> {
  const test = testClientFor(rpcUrl);
  const value = `0x${amount.toString(16).padStart(64, '0')}` as Hex;

  for (let slot = 0; slot < 64; slot += 1) {
    const key = keccak256(
      encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [holder, BigInt(slot)]),
    );
    const previous = await test.getStorageAt({ address: token, slot: key });
    await test.setStorageAt({ address: token, index: key, value });

    const balance = await test.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [holder] });
    if (balance === amount) return;

    // Wrong slot: put back exactly what was there.
    await test.setStorageAt({ address: token, index: key, value: previous ?? (`0x${'0'.repeat(64)}` as Hex) });
  }

  throw new Error(`could not locate the balance slot for ${token}`);
}
