/**
 * Local dev-chain helper. Talks to the anvil in docker-compose.
 *
 *   npm run dev:chain --workspace server -- deploy
 *       Deploys the stand-in USDC and mints a balance to the buyer account.
 *       As anvil account 0's first transaction it always lands at
 *       0x5FbDB2315678afecb367f032d93F642f64180aa3, which is what .env.example
 *       sets USDC_ADDRESS to for local development.
 *
 *   npm run dev:pay --workspace server -- <amount-usdc> <to-address>
 *       Sends that exact amount from the buyer account, the way a real buyer's
 *       wallet would. Use the amount the widget quotes, to the digit.
 *
 * Neither command exists in production: BasePay holds no keys and moves no funds.
 */
import { createRequire } from 'node:module';
import { createWalletClient, defineChain, getAddress, http, parseAbi, publicActions, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseDecimalToScaled } from '../src/sessions/amounts.js';

const require = createRequire(import.meta.url);
const artifact = require('../test/fixtures/MockUSDC.json') as { abi: unknown[]; bytecode: Hex };

const RPC_URL = process.env['DEV_CHAIN_RPC_URL'] ?? 'http://127.0.0.1:8545';
const CHAIN_ID = Number(process.env['DEV_CHAIN_ID'] ?? '31337');

/** anvil's deterministic dev accounts: index 0 deploys, index 1 pays. */
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const BUYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;

const ERC20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function mint(address to, uint256 value)',
]);

const chain = defineChain({
  id: CHAIN_ID,
  name: 'dev-chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const wallet = (key: Hex) =>
  createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC_URL) }).extend(publicActions);

async function deploy(): Promise<void> {
  const deployer = wallet(DEPLOYER_KEY);
  const buyer = privateKeyToAccount(BUYER_KEY);

  const hash = await deployer.deployContract({ abi: artifact.abi as never, bytecode: artifact.bytecode, args: [] });
  const receipt = await deployer.waitForTransactionReceipt({ hash });
  const token = receipt.contractAddress;
  if (!token) throw new Error('deployment produced no contract address');

  const mint = await deployer.writeContract({
    address: token,
    abi: ERC20,
    functionName: 'mint',
    args: [buyer.address, 1_000_000_000_000n], // 1,000,000 USDC
  });
  await deployer.waitForTransactionReceipt({ hash: mint });

  console.log(`Mock USDC deployed at ${token}`);
  console.log(`Buyer ${buyer.address} funded with 1,000,000 USDC`);
  console.log(`\nSet USDC_ADDRESS=${token} in your .env`);
}

async function pay(amountUsdc: string, to: string): Promise<void> {
  const token = getAddress(process.env['USDC_ADDRESS'] ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3');
  const recipient = getAddress(to);
  const value = parseDecimalToScaled(amountUsdc, 6);

  const buyer = wallet(BUYER_KEY);
  const balance = await buyer.readContract({ address: token, abi: ERC20, functionName: 'balanceOf', args: [buyer.account.address] });
  if (balance < value) {
    throw new Error(`buyer holds ${balance} micro-USDC but needs ${value}. Run "deploy" first.`);
  }

  const hash = await buyer.writeContract({
    address: token,
    abi: ERC20,
    functionName: 'transfer',
    args: [recipient as Address, value],
  });
  const receipt = await buyer.waitForTransactionReceipt({ hash });

  console.log(`Sent ${amountUsdc} USDC to ${recipient}`);
  console.log(`tx ${receipt.transactionHash} in block ${receipt.blockNumber}`);
}

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'deploy':
      await deploy();
      break;
    case 'pay': {
      const [amount, to] = args;
      if (!amount || !to) {
        throw new Error('usage: pay <amount-usdc> <to-address>');
      }
      await pay(amount, to);
      break;
    }
    default:
      console.error('usage: devchain.ts <deploy | pay <amount-usdc> <to-address>>');
      process.exitCode = 1;
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
