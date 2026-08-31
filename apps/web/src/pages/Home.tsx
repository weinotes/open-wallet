/**
 * Home page — Multi-chain asset overview, chain selector, quick actions.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │  Header: chain selector | lock btn  │
 *   ├─────────────────────────────────────┤
 *   │  Active chain total balance         │
 *   │  Native token balance + address     │
 *   │  (Token list — Phase 2)             │
 *   ├─────────────────────────────────────┤
 *   │  [Send] [Receive] [History] [Lock]  │
 *   └─────────────────────────────────────┘
 *
 * NOTE: This page only renders when store.unlocked === true.
 * All chain queries use accounts derived during unlock().
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Send, ArrowDownToLine, History, Settings } from 'lucide-react';
import { Button } from '@open-wallet/ui';
import { useWalletStore } from '../store/wallet.js';
import { chainRegistry } from '@open-wallet/core';
import { CHAIN_CONFIGS } from '@open-wallet/chains';
import { formatBalance } from '@open-wallet/shared';

export function Home() {
  const activeChainId = useWalletStore(s => s.activeChainId);
  const setActiveChain = useWalletStore(s => s.setActiveChain);
  const accounts = useWalletStore(s => s.accounts);
  const lock = useWalletStore(s => s.lock);

  const [balance, setBalance] = useState<string>('0');
  const [loading, setLoading] = useState(false);

  const activeChain = CHAIN_CONFIGS.find(c => c.chainId === activeChainId);

  // Find the account for the active chain (unlock derived one per chain)
  const currentAccount = accounts.find(a => a.chainId === activeChainId);

  // Fetch native balance for current chain
  useEffect(() => {
    if (!currentAccount) return;

    const adapter = chainRegistry.get(activeChainId);
    if (!adapter) return;

    setLoading(true);
    adapter.getNativeBalance(currentAccount.address)
      .then(b => setBalance(b))
      .catch(() => setBalance('0'))
      .finally(() => setLoading(false));
  }, [activeChainId, currentAccount?.address]);

  const contentStyle: React.CSSProperties = {
    maxWidth: 720,
    margin: '0 auto',
    padding: 'var(--ow-space-6)',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-6)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const balanceCardStyle: React.CSSProperties = {
    backgroundColor: 'var(--ow-bg-secondary)',
    borderRadius: 'var(--ow-radius-xl)',
    padding: 'var(--ow-space-8)',
    border: '1px solid var(--ow-border)',
    textAlign: 'center',
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'var(--ow-space-3)',
  };

  const chainSelector = (
    <select
      value={activeChainId}
      onChange={e => setActiveChain(e.target.value)}
      style={{
        backgroundColor: 'var(--ow-bg-tertiary)',
        color: 'var(--ow-text-primary)',
        border: '1px solid var(--ow-border)',
        borderRadius: 'var(--ow-radius-md)',
        padding: 'var(--ow-space-2) var(--ow-space-3)',
        fontSize: 'var(--ow-font-size-sm)',
        cursor: 'pointer',
      }}
    >
      {CHAIN_CONFIGS.map(c => (
        <option key={c.chainId} value={c.chainId}>
          {c.name} {c.testnet && '(testnet)'}
        </option>
      ))}
    </select>
  );

  const formattedBalance = activeChain
    ? formatBalance(balance, activeChain.nativeDecimals, 4)
    : '0';

  return (
    <div style={contentStyle}>
      <div style={headerStyle}>
        <div style={{ fontSize: 'var(--ow-font-size-lg)', fontWeight: 700 }}>
          OpenWallet
        </div>
        <div style={{ display: 'flex', gap: 'var(--ow-space-2)', alignItems: 'center' }}>
          {chainSelector}
          <Link to="/settings">
            <Button variant="ghost" size="sm">
              <Settings size={16} />
            </Button>
          </Link>
        </div>
      </div>

      {/* Balance card */}
      <div style={balanceCardStyle}>
        <div style={{ color: 'var(--ow-text-secondary)', fontSize: 'var(--ow-font-size-sm)', marginBottom: 'var(--ow-space-2)' }}>
          {activeChain?.name ?? 'Unknown'} — Native Balance
        </div>
        <div style={{ fontSize: 'var(--ow-font-size-3xl)', fontWeight: 700, fontFamily: 'var(--ow-font-mono)' }}>
          {loading ? '...' : formattedBalance}
        </div>
        <div style={{ color: 'var(--ow-text-tertiary)', fontSize: 'var(--ow-font-size-sm)', marginTop: 'var(--ow-space-1)' }}>
          {activeChain?.nativeSymbol}
        </div>
        {currentAccount && (
          <div style={{
            marginTop: 'var(--ow-space-4)',
            fontFamily: 'var(--ow-font-mono)',
            fontSize: 'var(--ow-font-size-xs)',
            color: 'var(--ow-text-secondary)',
            wordBreak: 'break-all',
          }}>
            {currentAccount.address}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={actionRowStyle}>
        <Link to="/send" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" style={{ width: '100%', flexDirection: 'column', padding: 'var(--ow-space-4)', gap: 'var(--ow-space-1)' }}>
            <Send size={20} /> Send
          </Button>
        </Link>
        <Link to="/receive" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" style={{ width: '100%', flexDirection: 'column', padding: 'var(--ow-space-4)', gap: 'var(--ow-space-1)' }}>
            <ArrowDownToLine size={20} /> Receive
          </Button>
        </Link>
        <Link to="/history" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" style={{ width: '100%', flexDirection: 'column', padding: 'var(--ow-space-4)', gap: 'var(--ow-space-1)' }}>
            <History size={20} /> History
          </Button>
        </Link>
        <Button
          variant="secondary"
          style={{ width: '100%', flexDirection: 'column', padding: 'var(--ow-space-4)', gap: 'var(--ow-space-1)' }}
          onClick={lock}
        >
          <Lock size={20} /> Lock
        </Button>
      </div>

      <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)' }}>
        OpenWallet · Apache-2.0 · v0.1.0
      </div>
    </div>
  );
}
