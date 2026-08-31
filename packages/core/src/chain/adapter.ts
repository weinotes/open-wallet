/**
 * Chain adapter interface — the core abstraction that unifies all chains.
 * Every chain (EVM, Solana, future ones) must implement this interface.
 *
 * Design goals:
 *   - Uniform API regardless of underlying chain
 *   - Adapter instances are stateless; private keys are passed in per-call
 *   - Fail gracefully on RPC errors with retry support at the chain level
 */

import type {
  Account,
  ChainConfig,
  FeeEstimate,
  RawTransaction,
  SignedTransaction,
  TokenBalance,
  TransactionRecord,
} from '@open-wallet/shared';

export interface ChainAdapter {
  /** Chain unique identifier (e.g. "bsc-56", "eth-1", "solana") */
  readonly chainId: string;

  /** Human-readable chain name */
  readonly chainName: string;

  /** The chain configuration this adapter was built from */
  readonly config: ChainConfig;

  // ─── Address operations ────────────────────────────────────────────

  /** Derive a native address from public key bytes */
  deriveAddress(publicKey: Uint8Array, accountIndex: number): string;

  /** Validate a native address format */
  validateAddress(address: string): boolean;

  // ─── Balance queries ───────────────────────────────────────────────

  /** Get native token balance (raw smallest unit, as string) */
  getNativeBalance(address: string): Promise<string>;

  /** Get ERC20/BEP20/SPL token balance */
  getTokenBalance(address: string, tokenAddress: string): Promise<string>;

  /** Get all known token balances for an address */
  getAllTokenBalances(address: string): Promise<TokenBalance[]>;

  // ─── Transaction lifecycle ──────────────────────────────────────────

  /** Build a raw unsigned transaction */
  buildTransaction(params: RawTransaction): Promise<RawTransaction>;

  /** Sign a transaction with the given private key */
  signTransaction(
    rawTx: RawTransaction,
    privateKey: Uint8Array,
  ): Promise<SignedTransaction>;

  /** Broadcast a signed transaction, returns tx hash */
  sendTransaction(signedTx: SignedTransaction): Promise<string>;

  // ─── Explorer / history ────────────────────────────────────────────

  /** Fetch transaction history for an address */
  getTransactionHistory(address: string): Promise<TransactionRecord[]>;

  /** Get transaction status by hash */
  getTransactionStatus(txHash: string): Promise<TransactionRecord['status']>;

  // ─── Fees ──────────────────────────────────────────────────────────

  /** Estimate fees for a transaction */
  estimateFees(params: RawTransaction): Promise<FeeEstimate>;

  /** Convert a human-readable amount to raw smallest unit string */
  parseAmount(amount: string): string;
}
