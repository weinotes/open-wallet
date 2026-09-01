/**
 * ERC20/BEP20 send-flow integration test — runs EvmAdapter token path
 * against BSC Testnet using WBNB (wrapped tBNB, the standard testnet
 * BEP20 — no faucet needed: we wrap our own tBNB).
 *
 * Modes:
 *   MODE=generate   Print a new random test private key + address, exit.
 *   (default)       Read PRIVATE_KEY env, wrap 0.005 tBNB → WBNB (if the
 *                   balance is 0), then send 0.0001 WBNB to self via the
 *                   real adapter ERC20 path
 *                   (getTokenInfo → encodeErc20Transfer → build → sign →
 *                   broadcast → poll).
 *
 * Optional env:
 *   GAS_PRICE_MULTIPLIER   Multiply the estimated gas price (default 1).
 *                          BSC testnet validators IGNORE floor-price txs
 *                          (~0.1 gwei, what the RPC suggests) — they sit in
 *                          the mempool forever. Use 20 (~2 gwei) for testnet.
 *
 * Usage:
 *   PRIVATE_KEY=0xabc... GAS_PRICE_MULTIPLIER=20 pnpm tsx scripts/erc20-test.ts
 */

import { EvmAdapter } from '../packages/chains/src/evm/adapter.js';
import { getChainConfig } from '../packages/chains/src/configs.js';
import { privateKeyToAccount } from 'viem/accounts';

/** WBNB on BSC testnet — standard wrapped-BNB contract with deposit() */
const WBNB_TESTNET = '0xae13d989dac2f0debff460ac112a837c89baa7cd';

function bytesToHex(bytes: Uint8Array, prefix = true): string {
  const h = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `0x${h}` : h;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

async function sleep(ms: number) { await new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pkHex = process.env.PRIVATE_KEY?.trim();
  if (!pkHex) {
    console.error('❌  PRIVATE_KEY env var is required.');
    process.exit(1);
  }
  const pkBytes = hexToBytes(pkHex);
  const acc = privateKeyToAccount(bytesToHex(pkBytes, true) as `0x${string}`);
  const from = acc.address;

  const bsc97Config = getChainConfig('bsc-97')!;
  const adapter = new EvmAdapter(bsc97Config);
  const pc = (adapter as any).publicClient;

  const multiplier = Number(process.env.GAS_PRICE_MULTIPLIER || '1');

  console.log('============================================');
  console.log('  ERC20 SEND FLOW — BSC TESTNET (97) / WBNB');
  console.log('============================================');
  console.log('From:   ', from);
  console.log('WBNB:   ', WBNB_TESTNET);

  // ── Step 0: token info + balances ─────────────────────────────
  console.log('\n[0/6] Token info + balances...');
  const info = await adapter.getTokenInfo(WBNB_TESTNET);
  console.log(`   ${info.symbol} (${info.name}) decimals=${info.decimals}`);
  if (info.symbol !== 'WBNB') {
    console.error(`❌  Unexpected token at ${WBNB_TESTNET}: ${info.symbol}`);
    process.exit(1);
  }

  let wbnbBal = BigInt(await adapter.getTokenBalance(from, WBNB_TESTNET));
  const nativeBal = BigInt(await adapter.getNativeBalance(from));
  console.log(`   WBNB balance  : ${(Number(wbnbBal) / 10 ** info.decimals).toFixed(6)}`);
  console.log(`   tBNB balance  : ${(Number(nativeBal) / 1e18).toFixed(6)}`);

  // ── Step 1: wrap tBNB → WBNB if balance is 0 ──────────────────
  if (wbnbBal === 0n) {
    console.log('\n[1/6] Wrapping 0.005 tBNB → WBNB (deposit)...');
    const wrapAmount = 5_000_000_000_000_000n; // 0.005 tBNB
    const depositData = '0xd0e30db0'; // deposit()

    // Build + sign + broadcast the wrap via a raw tx (viem)
    const nonce = await pc.getTransactionCount({ address: from });
    const gas = await pc.estimateGas({ account: from, to: WBNB_TESTNET, value: wrapAmount, data: depositData });
    const gasPrice = 2_000_000_000n; // 2 gwei — testnet miners
    const signed = await acc.signTransaction({
      chainId: 97,
      to: WBNB_TESTNET,
      value: wrapAmount,
      data: depositData,
      gas,
      gasPrice,
      nonce,
    });
    const resp = await fetch('https://bsc-testnet.publicnode.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signed], id: 1 }),
    });
    const out = JSON.parse(await resp.text()) as { result?: string; error?: { message: string } };
    if (out.error) { console.error('❌  Wrap broadcast failed:', out.error.message); process.exit(1); }
    console.log('   Wrap tx:', out.result);
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const rcpt = await pc.getTransactionReceipt({ hash: out.result }).catch(() => null);
      if (rcpt) {
        if (rcpt.status === 'success') { console.log('   ✅  Wrap confirmed'); break; }
        console.error('   💥  Wrap reverted'); process.exit(1);
      }
    }
    wbnbBal = BigInt(await adapter.getTokenBalance(from, WBNB_TESTNET));
    console.log(`   New WBNB balance: ${(Number(wbnbBal) / 10 ** info.decimals).toFixed(6)}`);
  } else {
    console.log('\n[1/6] WBNB balance > 0 — skipping wrap');
  }

  if (wbnbBal === 0n) {
    console.error('❌  Wrap failed or returned 0 — cannot continue');
    process.exit(1);
  }

  // ── Step 2: encode the ERC20 transfer ──────────────────────────
  console.log('\n[2/6] Encoding ERC20 transfer (0.0001 WBNB → self)...');
  const sendAmount = adapter.parseTokenAmount('0.0001', info.decimals);
  const data = adapter.encodeErc20Transfer(WBNB_TESTNET, from, sendAmount);
  console.log('   calldata:', data.slice(0, 66) + '...');

  // ── Step 3: build transaction ──────────────────────────────────
  console.log('\n[3/6] Building transaction...');
  let rawTx = await adapter.buildTransaction({ from, to: WBNB_TESTNET as `0x${string}`, value: '0', data });
  if (multiplier > 1) {
    if (rawTx.maxFeePerGas) {
      rawTx.maxFeePerGas = (BigInt(rawTx.maxFeePerGas) * BigInt(Math.round(multiplier * 100)) / 100n).toString();
      if (rawTx.maxPriorityFeePerGas) rawTx.maxPriorityFeePerGas = (BigInt(rawTx.maxPriorityFeePerGas) * BigInt(Math.round(multiplier * 100)) / 100n).toString();
    }
    if (rawTx.gasPrice) rawTx.gasPrice = (BigInt(rawTx.gasPrice) * BigInt(Math.round(multiplier * 100)) / 100n).toString();
  }
  console.log('   nonce:', rawTx.nonce, '| gasLimit:', rawTx.gasLimit, '| maxFee:', rawTx.maxFeePerGas ?? rawTx.gasPrice);

  // ── Step 4: sign ───────────────────────────────────────────────
  console.log('\n[4/6] Signing...');
  const signedTx = await adapter.signTransaction(rawTx, pkBytes);
  console.log('   ✅  Signature produced');

  // ── Step 5: broadcast ──────────────────────────────────────────
  console.log('\n[5/6] Broadcasting...');
  const hash = await adapter.sendTransaction(signedTx);
  console.log('   TxHash:', hash);
  console.log('   https://testnet.bscscan.com/tx/' + hash);

  // ── Step 6: poll for confirmation ──────────────────────────────
  console.log('\n[6/6] Waiting for confirmation...');
  let status: 'pending' | 'confirmed' | 'failed' = 'pending';
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    status = await adapter.getTransactionStatus(hash);
    if (status !== 'pending') break;
  }
  console.log('   status:', status);
  if (status === 'confirmed') {
    console.log('\n🎉  ERC20 transfer CONFIRMED on BSC Testnet!');
    const finalBal = BigInt(await adapter.getTokenBalance(from, WBNB_TESTNET));
    console.log(`   WBNB before: ${(Number(wbnbBal) / 10 ** info.decimals).toFixed(6)}`);
    console.log(`   WBNB after : ${(Number(finalBal) / 10 ** info.decimals).toFixed(6)}`);
    console.log('   (self-transfer: net change ≈ 0 + gas)');
  } else if (status === 'failed') {
    console.log('\n💥  Transaction reverted!');
  } else {
    console.log('\n⏳  Still pending — check manually at testnet.bscscan.com');
  }
}

main().catch(e => {
  console.error('❌  Fatal:', e.message || e);
  process.exit(1);
});
