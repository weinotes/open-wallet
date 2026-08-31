/**
 * Solana chain adapter (stable @solana/web3.js v1.x).
 *
 * Solana differs fundamentally from EVM:
 *   - Ed25519 signatures (not secp256k1)
 *   - Base58 encoded addresses
 *   - Account model vs UTXO
 *
 * Note: Full transaction signing is in Phase 2; this adapter currently
 * supports address derivation, balance queries, and fee estimation.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

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
    return {
      ...params,
      chainId: this.config.chainId,
    };
  }

  async signTransaction(
    _rawTx: RawTransaction,
    _privateKey: Uint8Array,
  ): Promise<SignedTransaction> {
    // Phase 1 placeholder — full Solana signing requires Keypair which
    // differs from our secp256k1 EVM approach. Implementation in Phase 2.
    throw new Error('Solana transaction signing coming in Phase 2');
  }

  async sendTransaction(_signedTx: SignedTransaction): Promise<string> {
    throw new Error('Solana transaction sending coming in Phase 2');
  }

  // ─── Explorer ──────────────────────────────────────────────────────

  async getTransactionHistory(_address: string): Promise<TransactionRecord[]> {
    return [];
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

  async estimateFees(_params: RawTransaction): Promise<FeeEstimate> {
    try {
      const fee = await this.connection.getMinimumBalanceForRentExemption(0);
      const priorityFee = 0;
      const total = fee + priorityFee;
      return {
        level: 'medium',
        gasLimit: '500',
        gasPrice: total.toString(),
        totalFee: total.toString(),
      };
    } catch {
      return {
        level: 'medium',
        gasLimit: '500',
        gasPrice: (LAMPORTS_PER_SOL / 100000).toString(), // fallback: 0.00001 SOL
        totalFee: (LAMPORTS_PER_SOL / 100000).toString(),
      };
    }
  }

  /** Convert human-readable SOL amount to lamports string */
  parseAmount(amount: string): string {
    return parseAmountHelper(amount, this.config.nativeDecimals);
  }
}
