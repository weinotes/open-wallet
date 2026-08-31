/**
 * Wallet Zustand store — global state for the web app.
 *
 * State layout:
 *   vault       — encrypted vault data (persisted, this is safe)
 *   unlocked    — boolean flag (NOT persisted)
 *   accounts    — derived addresses (NOT persisted, re-derived on each unlock)
 *   ui          — theme, language, active chain (persisted, safe)
 *
 * SECURITY NOTE: mnemonic NEVER enters Zustand at all — it lives only in
 * SessionManager's module-level closure. The store only ever holds:
 *   - Account records (addresses + derivation paths — public info)
 *   - encryptedVault blob (safe to store)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VaultData, Account } from '@open-wallet/shared';
import { APP_NAME, DEFAULT_LANGUAGE, DEFAULT_THEME } from '@open-wallet/shared';
import type { ChainConfig } from '@open-wallet/shared';
import { unlock as sessionUnlock, lock as sessionLock } from '@open-wallet/core';

interface WalletState {
  // ─── Vault (persisted encrypted blob — safe) ────
  vaultExists: boolean;
  encryptedVault: VaultData | null;

  // ─── Unlocked flag (NOT persisted — derived fresh each session) ──
  unlocked: boolean;

  // ─── Accounts (public chain addresses, NOT persisted — re-derived on unlock) ──
  accounts: Account[];

  // ─── UI state (persisted — safe, just preferences) ──
  theme: 'dark' | 'light';
  language: 'en' | 'zh';
  activeChainId: string;
  activeAccountId: string | null;

  // ─── Actions ────────────────────────────
  setVault: (vault: VaultData) => void;
  clearVault: () => void;

  /** Async unlock → decrypt vault + derive accounts */
  unlock: (password: string, chainConfigs: ChainConfig[]) => Promise<void>;
  lock: () => void;

  setActiveAccount: (id: string) => void;

  setTheme: (t: 'dark' | 'light') => void;
  setLanguage: (l: 'en' | 'zh') => void;
  setActiveChain: (chainId: string) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      vaultExists: false,
      encryptedVault: null,

      unlocked: false,
      accounts: [],

      theme: DEFAULT_THEME,
      language: DEFAULT_LANGUAGE,
      activeChainId: 'bsc-56',
      activeAccountId: null,

      // ── Vault management ──
      setVault: (vault) => set({ vaultExists: true, encryptedVault: vault }),

      clearVault: () => {
        sessionLock();
        set({
          vaultExists: false,
          encryptedVault: null,
          unlocked: false,
          accounts: [],
          activeAccountId: null,
        });
      },

      // ── Session lifecycle ──
      unlock: async (password, chainConfigs) => {
        const state = useWalletStore.getState();
        if (!state.encryptedVault) {
          throw new Error('No vault found — wallet not initialized');
        }
        const accounts = await sessionUnlock(state.encryptedVault, password, chainConfigs);
        set({
          unlocked: true,
          accounts,
          activeAccountId: state.activeAccountId ?? accounts[0]?.id ?? null,
        });
      },

      lock: () => {
        sessionLock();
        set({ unlocked: false, accounts: [], activeAccountId: null });
      },

      // ── UI ──
      setActiveAccount: (id) => set({ activeAccountId: id }),
      setTheme: (t) => set({ theme: t }),
      setLanguage: (l) => set({ language: l }),
      setActiveChain: (chainId) => set({ activeChainId: chainId }),
    }),
    {
      name: `${APP_NAME}-store`,
      // ONLY persist safe data — no session material, no accounts (re-derived each unlock)
      partialize: (state) => ({
        vaultExists: state.vaultExists,
        encryptedVault: state.encryptedVault,
        theme: state.theme,
        language: state.language,
        activeChainId: state.activeChainId,
        // NOTE: accounts, unlocked, activeAccountId intentionally excluded
        // — they are re-derived from the mnemonic on each unlock
      }),
    },
  ),
);
