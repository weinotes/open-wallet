/**
 * SessionManager — in-memory wallet session lifecycle.
 *
 * Responsibilities:
 *   - Decrypt vault with user password → recover mnemonic
 *   - HD-derive accounts across all supported chains
 *   - Provide private keys on demand (for signing)
 *   - Lock → erase all sensitive data from memory
 *
 * Security rules:
 *   - Never persists mnemonic or private keys — localStorage is forbidden
 *   - Wipes buffers after use where possible
 *   - Auto-lock recommended after 5 min of inactivity (handled by UI layer)
 */

import {
  decryptVault,
  deriveEvmPrivateKey,
  deriveSolanaPrivateKey,
  evmPublicKey,
  solanaPublicKey,
} from '../index.js';
import { chainRegistry } from '../chain/registry.js';
import type { Account, VaultData, ChainConfig } from '@open-wallet/shared';
import { generateId, wipeBytes } from '@open-wallet/shared';

export interface SessionState {
  unlocked: boolean;
  mnemonic: string | null;
  accounts: Account[];
  unlockedAt: number | null;          // unix ms
  lastActivityAt: number | null;      // for auto-lock
}

// ─── Module-level in-memory state (never serialized) ──────────────────

let state: SessionState = {
  unlocked: false,
  mnemonic: null,
  accounts: [],
  unlockedAt: null,
  lastActivityAt: null,
};

/** Get a snapshot of the current session state */
export function getSessionState(): Readonly<SessionState> {
  return { ...state, accounts: [...state.accounts] };
}

/** Whether the session is currently unlocked */
export function isUnlocked(): boolean {
  return state.unlocked;
}

/** Touch the last-activity timestamp (call before each signing / balance query) */
export function touchActivity(): void {
  state.lastActivityAt = Date.now();
}

// ─── Account derivation ───────────────────────────────────────────────

/**
 * Derive one account per registered chain from the mnemonic.
 * Uses each chain's configured BIP44 path + accountIndex.
 */
function deriveAllAccounts(
  mnemonic: string,
  chainConfigs: ChainConfig[],
): Account[] {
  const accounts: Account[] = [];

  for (const config of chainConfigs) {
    const adapter = chainRegistry.get(config.chainId);
    if (!adapter) {
      // Register on the fly if adapter isn't in the registry yet
      // (e.g. custom RPC chains added by user)
      continue;
    }

    const accountIndex = 0; // first account per chain
    const derivationPath = `${config.bip44Path}/${accountIndex}`;

    let privateKey: Uint8Array;
    let publicKey: Uint8Array;

    if (config.type === 'evm') {
      privateKey = deriveEvmPrivateKey(mnemonic, derivationPath);
      publicKey = evmPublicKey(privateKey);
    } else if (config.type === 'solana') {
      privateKey = deriveSolanaPrivateKey(mnemonic, derivationPath);
      publicKey = solanaPublicKey(privateKey);
    } else {
      continue; // unsupported chain type
    }

    const address = adapter.deriveAddress(publicKey, accountIndex);

    accounts.push({
      id: generateId(),
      chainId: config.chainId,
      address,
      publicKey: publicKey.reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
      derivationPath,
      accountIndex,
      nickname: config.name,
      createdAt: Date.now(),
    });

    // Best-effort wipe of the ephemeral privateKey from this scope
    wipeBytes(privateKey);
  }

  return accounts;
}

// ─── Lifecycle ───────────────────────────────────────────────────────

/**
 * Unlock the wallet: decrypt vault → derive accounts → hold in memory.
 * Throws on wrong password or corrupted vault.
 */
export async function unlock(
  vault: VaultData,
  password: string,
  chainConfigs: ChainConfig[],
): Promise<Account[]> {
  const mnemonic = await decryptVault(vault, password);
  const accounts = deriveAllAccounts(mnemonic, chainConfigs);

  state = {
    unlocked: true,
    mnemonic,
    accounts,
    unlockedAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  return accounts;
}

/**
 * Lock the wallet — erase all sensitive data from memory.
 * Safe to call multiple times (idempotent).
 */
export function lock(): void {
  // Scrub the mnemonic string reference — V8 GC handles the rest
  // but we at least null it out so nothing can read it
  state.mnemonic = null;
  state.unlocked = false;
  state.accounts = [];
  state.unlockedAt = null;
  state.lastActivityAt = null;
}

// ─── Signing helpers ─────────────────────────────────────────────────

/**
 * Get a transient private key for the given account.
 * The caller is responsible for using it immediately — do NOT store it.
 *
 * Throws if session is locked or account is not found.
 */
export function getPrivateKey(account: Account): Uint8Array {
  if (!state.unlocked || !state.mnemonic) {
    throw new Error('Wallet is locked');
  }

  const config = chainRegistry.get(account.chainId)?.config;
  if (!config) {
    throw new Error(`No chain config for ${account.chainId}`);
  }

  touchActivity();

  if (config.type === 'evm') {
    return deriveEvmPrivateKey(state.mnemonic, account.derivationPath);
  } else if (config.type === 'solana') {
    return deriveSolanaPrivateKey(state.mnemonic, account.derivationPath);
  }

  throw new Error(`Unsupported chain type: ${config.type}`);
}
