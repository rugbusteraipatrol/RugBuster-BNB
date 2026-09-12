import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { getAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, type Config } from '../../src/config.js';
import { getMerchant } from '../../src/db/merchants.js';
import { getSession } from '../../src/db/sessions.js';
import { listDeliveriesForSession } from '../../src/db/webhookDeliveries.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { Watcher } from '../../src/watcher/watcher.js';
import { WebhookWorker } from '../../src/webhooks/dispatcher.js';
import { verifySignature } from '../../src/webhooks/signature.js';
import {
  ANVIL_ACCOUNTS,
  ANVIL_CHAIN_ID,
  anvilAvailable,
  deployMockUsdc,
  ERC20_ABI,
  fundErc20ViaStorage,
  publicFor,
  startAnvil,
  testClientFor,
  walletFor,
  type AnvilHandle,
} from '../helpers/anvil.js';
import { createTestPool, hasDatabase, resetDatabase, TEST_DATABASE_URL } from '../helpers/db.js';
import { fixedPriceService, seedMerchant } from '../helpers/fixtures.js';

/**
 * The watcher against a real chain: real JSON-RPC, real ERC-20 Transfer logs,
 * real block progression and confirmations.
 *
 * Needs the `anvil` binary (Foundry) on PATH. Without it the suite skips — CI
 * installs Foundry so it always runs there.
 *
 * By default anvil starts empty and a 6-decimal stand-in token is deployed, so
 * the suite is hermetic. Set BASE_FORK_RPC_URL to fork Base mainnet instead and
 * exercise the real USDC contract at its real address.
 */
const FORK_URL = process.env['BASE_FORK_RPC_URL'];
const USDC_ON_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const SECRET = 'whsec_anvil_secret_value_0123456';

const enabled = hasDatabase && anvilAvailable();

const buyer = privateKeyToAccount(ANVIL_ACCOUNTS.buyer);
const MERCHANT = getAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');

describe.skipIf(!enabled)(`watcher against anvil${FORK_URL ? ' (forked Base)' : ''}`, () => {
  let pool: pg.Pool;
  let anvil: AnvilHandle;
  let token: Address;
  let receiver: Server;
  let receiverUrl: string;
  let delivered: Array<{ body: string; headers: Record<string, string | undefined> }>;

  beforeAll(async () => {
    pool = await createTestPool();
    anvil = await startAnvil({ forkUrl: FORK_URL });

    if (FORK_URL) {
      // Real USDC: give the buyer a balance by writing the token's own storage.
      token = USDC_ON_BASE;
      await fundErc20ViaStorage(anvil.rpcUrl, token, buyer.address, 1_000_000_000n);
    } else {
      token = await deployMockUsdc(anvil.rpcUrl, buyer.address, 1_000_000_000n);
    }

    delivered = [];
    receiver = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        delivered.push({
          body: Buffer.concat(chunks).toString('utf8'),
          headers: req.headers as Record<string, string | undefined>,
        });
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hooks`;
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
    await anvil?.stop();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await seedMerchant(pool, { walletAddress: MERCHANT, webhookUrl: receiverUrl, webhookSecret: SECRET });
    delivered.length = 0;
  });

  /** Config pointed at this anvil instance and the token deployed above. */
  function build(overrides: Record<string, string> = {}): Config {
    return loadConfig({
      DATABASE_URL: TEST_DATABASE_URL,
      ADMIN_TOKEN: 'test-admin-token',
      LOG_LEVEL: 'silent',
      WATCHER_ENABLED: 'true',
      CHAIN_ID: String(ANVIL_CHAIN_ID),
      USDC_ADDRESS: token,
      BASE_RPC_HTTP_URL: anvil.rpcUrl,
      CONFIRMATIONS_REQUIRED: '3',
      WEBHOOK_BACKOFF_BASE_SECONDS: '1',
      ...overrides,
    });
  }

  const mine = async (blocks: number) => {
    await testClientFor(anvil.rpcUrl).mine({ blocks });
  };

  async function sendUsdc(to: Address, value: bigint): Promise<void> {
    const wallet = walletFor(ANVIL_ACCOUNTS.buyer, anvil.rpcUrl);
    const hash = await wallet.writeContract({ address: token, abi: ERC20_ABI, functionName: 'transfer', args: [to, value] });
    await wallet.waitForTransactionReceipt({ hash });
  }

  it('takes a real payment from pending to paid and delivers a signed webhook', async () => {
    const config = build();
    const sessions = new SessionService(pool, config, fixedPriceService());
    const watcher = new Watcher(pool, config, publicFor(anvil.rpcUrl));

    await watcher.tick(); // bookmark the current head
    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00', orderRef: 'ANVIL-1' });
    expect(session.status).toBe('pending');

    await sendUsdc(MERCHANT, BigInt(session.amountUsdcMicro));
    await watcher.tick();
    expect((await getSession(pool, session.sessionId))?.status).toBe('confirming');

    await mine(2);
    await watcher.tick();

    const settled = await getSession(pool, session.sessionId);
    expect(settled?.status).toBe('paid');
    expect(settled?.receivedUsdc).toBe(BigInt(session.amountUsdcMicro));
    expect(settled?.confirmations).toBeGreaterThanOrEqual(3);

    // The merchant actually holds the funds; the service never touched them.
    const balance = await publicFor(anvil.rpcUrl).readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [MERCHANT],
    });
    expect(balance).toBe(BigInt(session.amountUsdcMicro));

    const worker = new WebhookWorker(pool, config, async (id) => (await getMerchant(pool, id))?.webhookSecret ?? null);
    const results = await worker.tick();
    expect(results[0]?.outcome).toBe('delivered');

    expect(delivered).toHaveLength(1);
    const hook = delivered[0];
    expect(
      verifySignature({
        secret: SECRET,
        rawBody: hook?.body ?? '',
        timestamp: hook?.headers['x-basepay-timestamp'] ?? '',
        signature: hook?.headers['x-basepay-signature'] ?? '',
      }),
    ).toBe(true);
    expect(JSON.parse(hook?.body ?? '{}')).toMatchObject({
      type: 'payment.paid',
      data: { orderRef: 'ANVIL-1', status: 'paid', amountUsd: '45.00' },
    });

    const deliveries = await listDeliveriesForSession(pool, session.sessionId);
    expect(deliveries[0]?.status).toBe('delivered');
  });

  it('tells two same-priced payments apart by their quoted amounts', async () => {
    const config = build();
    const sessions = new SessionService(pool, config, fixedPriceService());
    const watcher = new Watcher(pool, config, publicFor(anvil.rpcUrl));
    await watcher.tick();

    const first = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    const second = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    expect(first.amountUsdcMicro).not.toBe(second.amountUsdcMicro);

    await sendUsdc(MERCHANT, BigInt(second.amountUsdcMicro));
    await mine(3);
    await watcher.tick();

    expect((await getSession(pool, first.sessionId))?.status).toBe('pending');
    expect((await getSession(pool, second.sessionId))?.status).toBe('paid');
  });

  it('marks a short payment underpaid and reports what arrived', async () => {
    const config = build();
    const sessions = new SessionService(pool, config, fixedPriceService());
    const watcher = new Watcher(pool, config, publicFor(anvil.rpcUrl));
    await watcher.tick();

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    const short = BigInt(session.amountUsdcMicro) - 10_000_000n;
    await sendUsdc(MERCHANT, short);
    await watcher.tick();

    const record = await getSession(pool, session.sessionId);
    expect(record?.status).toBe('underpaid');
    expect(record?.receivedUsdc).toBe(short);

    const worker = new WebhookWorker(pool, config, async (id) => (await getMerchant(pool, id))?.webhookSecret ?? null);
    await worker.tick();
    expect(JSON.parse(delivered[0]?.body ?? '{}')).toMatchObject({ type: 'payment.underpaid' });
  });

  it('backfills a payment that landed while the watcher was not running', async () => {
    const config = build();
    const sessions = new SessionService(pool, config, fixedPriceService());
    const watcher = new Watcher(pool, config, publicFor(anvil.rpcUrl));
    await watcher.tick();

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });

    // No ticks at all while the payment lands and the chain moves on.
    await sendUsdc(MERCHANT, BigInt(session.amountUsdcMicro));
    await mine(30);

    const restarted = new Watcher(pool, config, publicFor(anvil.rpcUrl));
    await restarted.tick();

    expect((await getSession(pool, session.sessionId))?.status).toBe('paid');
  });
});
