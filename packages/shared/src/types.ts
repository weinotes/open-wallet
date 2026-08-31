/**
 * Shared type definitions used across all packages and platforms.
 * These are pure data types with no runtime dependencies.
 */

/** Supported chain types */
export type ChainType = 'evm' | 'solana' | 'utxo' | 'cosmos';

/** Fee estimation level */
export type FeeLevel = 'low' | 'medium' | 'high';

/** Password strength result */
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'weak' | 'fair' | 'good' | 'strong';
  errors: string[];
}

/** Unified account model across all chains */
export interface Account {
  id: string;               // unique account id (uuid or derived)
  chainId: string;          // e.g. "bsc-56", "eth-1", "solana"
  address: string;          // native address format per chain
  publicKey: string;        // hex or base58 encoded
  derivationPath: string;   // e.g. "m/44'/60'/0'/0/0"
  accountIndex: number;     // index within the derivation path
  nickname?: string;
  createdAt: number;        // unix timestamp
}

/** Unified token model */
export interface Token {
  address: string;          // "0x..." for EVM, token mint for Solana, "native" for chain native
  symbol: string;
  name: string;
  decimals: number;
  chainId: string;
  logoUrl?: string;
  priceUsd?: number;
  isNative: boolean;
}

/** Token with balance info */
export interface TokenBalance extends Token {
  balance: string;          // string to preserve precision
  balanceUsd?: number;
}

/** Raw transaction before signing */
export interface RawTransaction {
  from: string;
  to: string;
  value: string;            // wei/lamports as string
  data?: string;
  gasLimit?: string;
  gasPrice?: string;        // legacy
  maxFeePerGas?: string;    // EIP-1559
  maxPriorityFeePerGas?: string;
  nonce?: number;
  chainId?: string;
}

/** Signed transaction ready for broadcast */
export interface SignedTransaction {
  raw: unknown;             // chain-specific serialized tx
  signature: string;
}

/** Fee estimate result */
export interface FeeEstimate {
  level: FeeLevel;
  gasLimit: string;         // estimated gas units
  gasPrice: string;         // per-unit price in native token (wei/lamports)
  totalFee: string;         // total fee = gasLimit * gasPrice
  totalFeeUsd?: number;
}

/** Transaction record from block explorer */
export interface TransactionRecord {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol?: string;
  tokenAddress?: string;
  tokenDecimals?: number;       // for ERC20/BEP20 tokens; undefined = native
  blockNumber: number;
  blockTimestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  direction: 'sent' | 'received';
  fee?: string;
}

/** Wallet vault encrypted storage format */
export interface VaultData {
  version: number;
  ciphertext: string;       // AES-256-GCM encrypted mnemonic/private keys
  salt: string;             // hex-encoded 16 bytes
  iv: string;               // hex-encoded 12 bytes
  authTag: string;          // hex-encoded 16 bytes (GCM authentication)
  kdf: 'pbkdf2-sha512';
  iterations: number;
}

/** Chain runtime configuration */
export interface ChainConfig {
  chainId: string;          // unique identifier "type-id"
  name: string;
  type: ChainType;
  chainIdDecimal?: number;  // for EVM chains only
  nativeSymbol: string;
  nativeDecimals: number;
  rpcs: string[];           // ordered by priority, with failover
  explorer?: string;        // base explorer URL
  bip44Path: string;        // e.g. "m/44'/60'/0'/0"
  icon?: string;
  testnet?: boolean;
}
