/**
 * Copyright 2026 Davey Wong <wgwcko@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Solana chain adapter (stable @solana/web3.js v1.x).
 *
 * Solana differs fundamentally from EVM:
 *   - Ed25519 signatures (not secp256k1) — uses SLIP-0010 hardened paths only
 *   - Base58 encoded addresses
 *   - Account model vs UTXO
 *   - Transaction fee = 5000 lamports × signature count (no gas auctions)
 *
 * Full transaction lifecycle (build → sign → send) is now implemented.
 * SPL token support is limited to balance queries; token transfers
 * would require building Associated Token Account instructions.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  Keypair,
} from '@solana/web3.js';
import bs58 from 'bs58';

import type {
  ChainConfig,
  FeeEstimate,
  RawTransaction,
  SignedTransaction,
  TokenBalance,
  TransactionRecord,
} from '@open-wallet/shared';
import { parseAmount as parseAmountHelper } from '@open-wallet/shared';
import type { ChainAdapter } from '@open-wallet/core';

export class SolanaAdapter implements ChainAdapter {
  readonly chainId: string;
  readonly chainName: string;
  readonly config: ChainConfig;

  private connection: Connection;

  constructor(config: ChainConfig) {
    this.config = config;
    this.chainId = config.chainId;
    this.chainName = config.name;

    this.connection = new Connection(config.rpcs[0], 'confirmed');
  }

  // ─── Address ──────────────────────────────────────────────────────

  deriveAddress(publicKey: Uint8Array, _accountIndex: number): string {
    return new PublicKey(publicKey).toBase58();
  }

  validateAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Balance ───────────────────────────────────────────────────────

  async getNativeBalance(address: string): Promise<string> {
    const bal = await this.connection.getBalance(new PublicKey(address));
    return bal.toString();
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<string> {
    try {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        new PublicKey(address),
        { mint: new PublicKey(tokenAddress) },
      );
      return accounts.value[0]?.account.data.parsed.info.tokenAmount.amount ?? '0';
    } catch {
      return '0';
    }
  }

  async getAllTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      const owner = new PublicKey(address);
      const accounts = await this.connection.getParsedTokenAccountsByOwner(owner, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      return accounts.value.map(acc => ({
        address: acc.account.data.parsed.info.mint,
        symbol: '',
        name: '',
        decimals: acc.account.data.parsed.info.tokenAmount.decimals,
        chainId: this.config.chainId,
        isNative: false,
        balance: acc.account.data.parsed.info.tokenAmount.amount,
      }));
    } catch {
      return [];
    }
  }

  // ─── Transactions ──────────────────────────────────────────────────

  async buildTransaction(params: RawTransaction): Promise<RawTransaction> {
    // Solana 需要一个 recentBlockhash 才能签名。我们在这里获取一次，
    // 实际 Transaction 对象会在 signTransaction 中构建（保持 stateless）。
    await this.connection.getLatestBlockhash('finalized').catch(() => {
      // 如果 finalised 拿不到（罕见），用 confirmed
      return this.connection.getLatestBlockhash('confirmed');
    });

    return {
      ...params,
      chainId: this.config.chainId,
    };
  }

  async signTransaction(
    rawTx: RawTransaction,
    privateKey: Uint8Array,
  ): Promise<SignedTransaction> {
    // Solana 用 ed25519 — privateKey 是 32-byte ed25519 seed（来自 SLIP-0010）
    const keypair = Keypair.fromSeed(privateKey);

    const fromPubkey = new PublicKey(rawTx.from);
    const toPubkey = new PublicKey(rawTx.to);
    const lamports = BigInt(rawTx.value).toString();

    // 获取最新 blockhash
    const { blockhash } = await this.connection.getLatestBlockhash('finalized');

    // 构建 Transaction
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: fromPubkey,
    }).add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: BigInt(lamports),
      }),
    );

    // 签名
    transaction.sign(keypair);

    // 取 base58 signature
    const sigBytes = transaction.signatures[0].signature;
    if (!sigBytes) {
      throw new Error('Signing produced no signature');
    }

    return {
      raw: transaction,
      signature: bs58.encode(sigBytes),
    };
  }

  async sendTransaction(signedTx: SignedTransaction): Promise<string> {
    const transaction = signedTx.raw as Transaction;

    // 用 preflight check 确保 tx 不会立即 fail
    const signature = await this.connection.sendRawTransaction(
      transaction.serialize({ requireAllSignatures: false }),
      {
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      },
    );

    return signature;
  }

  // ─── Explorer ──────────────────────────────────────────────────────

  /** Derive Solscan or local explorer URL for a tx hash */
  getExplorerTxUrl(txHash: string): string {
    const base = this.config.explorer ?? 'https://explorer.solana.com';
    // Determine if we're on devnet
    const isDevnet = this.config.rpcs.some(r =>
      r.toLowerCase().includes('devnet') || r.toLowerCase().includes('test'),
    );
    const cluster = isDevnet ? '?cluster=devnet' : '';
    return `${base.replace(/\/$/, '')}/tx/${txHash}${cluster}`;
  }

  /**
   * Fetch transaction history for a Solana address.
   *
   * Solana RPC natively supports getSignaturesForAddress (no need for
   * a third-party block explorer). The tradeoff is that each signature
   * only carries slot + timestamp; the full details (transfer amount,
   * direction, fee) need an additional getParsedTransaction call.
   *
   * We batch the first 20 signatures — more than that is prohibitively
   * slow without a dedicated indexer.
   */
  async getTransactionHistory(address: string): Promise<TransactionRecord[]> {
    try {
      const pubkey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(
        pubkey,
        { limit: 20 },
        'confirmed',
      );

      const results: TransactionRecord[] = [];

      // Fetch full tx details in parallel (bounded to 20 max)
      const details = await Promise.allSettled(
        signatures.map(sig => this.connection.getParsedTransaction(sig.signature, 'confirmed')),
      );

      for (let i = 0; i < signatures.length; i++) {
        const sig = signatures[i];
        const detailResult = details[i];

        const base: TransactionRecord = {
          hash: sig.signature,
          from: address,
          to: '',
          value: '0',
          blockNumber: sig.slot,
          blockTimestamp: sig.blockTime ?? 0,
          status: sig.err ? 'failed' : 'confirmed',
          direction: 'sent',      // default; refined below
        };

        if (detailResult.status === 'fulfilled' && detailResult.value) {
          const tx = detailResult.value;
          const meta = tx.meta;

          // Fee
          if (meta?.fee !== undefined) {
            base.fee = meta.fee.toString();
          }

          // Try to find a native SOL transfer via SystemProgram instruction
          // in the parsed inner or outer instructions.
          const parsedIx = tx.transaction.message.instructions;
          for (const ix of parsedIx) {
            const parsed = (ix as { parsed?: unknown }).parsed as
              | {
                  program?: string;
                  type?: string;
                  info?: { source?: string; destination?: string; lamports?: number };
                }
              | undefined;
            if (
              parsed?.program === 'system' &&
              parsed.type === 'transfer' &&
              parsed.info?.source === address
            ) {
              base.from = parsed.info.source;
              base.to = parsed.info.destination ?? '';
              base.value = parsed.info.lamports?.toString() ?? '0';
              base.direction = 'sent';
              break;
            }
            // Received SOL — look at pre/post balances of other accounts
          }

          // Detect "received" by comparing pre/post balances at our index
          if (meta?.preBalances && meta.postBalances) {
            try {
              const accountKeys = tx.transaction.message.accountKeys;
              const accountIndex = accountKeys.findIndex(
                k => (k.pubkey as PublicKey).toBase58() === address,
              );
              if (accountIndex >= 0) {
                const diff = (meta.postBalances[accountIndex] ?? 0) - (meta.preBalances[accountIndex] ?? 0);
                // If balance increased overall, it's a receive (not our primary transfer above)
                if (diff > 0 && base.direction === 'sent' && BigInt(base.value ?? '0') === 0n) {
                  // Only treat as received if we didn't already identify a transfer
                  base.direction = 'received';
                  base.value = diff.toString();
                }
              }
            } catch {
              // account key parsing may fail — no big deal, skip direction refine
            }
          }
        }

        results.push(base);
      }

      // Sort newest first (signatures already come that way — be safe)
      results.sort((a, b) => b.blockTimestamp - a.blockTimestamp);
      return results;
    } catch {
      return [];
    }
  }

  async getTransactionStatus(txHash: string): Promise<TransactionRecord['status']> {
    try {
      const status = await this.connection.getSignatureStatuses([txHash]);
      const info = status.value[0];
      if (!info) return 'pending';
      if (info.err) return 'failed';
      return 'confirmed';
    } catch {
      return 'pending';
    }
  }

  // ─── Fees ──────────────────────────────────────────────────────────

  async estimateFees(params: RawTransaction): Promise<FeeEstimate> {
    try {
      // Solana fee = base fee (5000 lamports per signature) + priority fee
      // A simple SystemProgram.transfer has 1 signature → 5000 lamports base
      // We could use connection.getFeeForMessage for exact value, but that
      // requires building a full Message — keep it simple here.
      const SIGNATURE_FEE = 5000n;
      const signatureCount = 1n; // one payer signature
      const baseFee = SIGNATURE_FEE * signatureCount;

      // Optional priority fee — default 0 (can be upped for congestion)
      const priorityFee = 0n;
      const totalFee = baseFee + priorityFee;

      return {
        level: 'medium',
        gasLimit: '2000',          // Solana compute units (≈ 2000 for a transfer)
        gasPrice: baseFee.toString(),
        totalFee: totalFee.toString(),
      };
    } catch {
      // Fallback — hardcoded 5000 lamports (default transfer fee)
      const fallback = '5000';
      void params;
      return {
        level: 'medium',
        gasLimit: '2000',
        gasPrice: fallback,
        totalFee: fallback,
      };
    }
  }

  /** Convert human-readable SOL amount to lamports string */
  parseAmount(amount: string): string {
    return parseAmountHelper(amount, this.config.nativeDecimals);
  }
}
