/**
 * Transaction history page.
 *
 * Data source: useTransactionHistory hook, which merges:
 *   - Locally-known pending txs (from wallet store)
 *   - Block explorer API (confirmed/failed history)
 *
 * Supports EVM (Etherscan) and Solana (native RPC) adapters — the
 * adapter handles the chain-specific fetch logic, this page only
 * renders the unified TransactionRecord shape.
 */

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@open-wallet/ui';
import { useWalletStore } from '../store/wallet.js';
import { CHAIN_CONFIGS } from '@open-wallet/chains';
import { useTransactionHistory } from '../hooks/useTransactionHistory.js';
import { chainRegistry } from '@open-wallet/core';
import { formatBalance } from '@open-wallet/shared';
import type { TransactionRecord } from '@open-wallet/shared';

function truncateHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function formatTime(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return t('history.justNow');
  if (diffMin < 60) return t('history.minutesAgo', { n: diffMin });
  if (diffHr < 24) return t('history.hoursAgo', { n: diffHr });
  if (diffDay < 7) return t('history.daysAgo', { n: diffDay });
  return d.toLocaleDateString();
}

function StatusBadge({ status, t }: { status: TransactionRecord['status']; t: (key: string) => string }) {
  const styles: Record<TransactionRecord['status'], { bg: string; color: string; icon: JSX.Element; label: string }> = {
    pending: {
      bg: 'rgba(245, 158, 11, 0.12)',
      color: '#f59e0b',
      icon: <Clock size={12} />,
      label: t('history.pending'),
    },
    confirmed: {
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#10b981',
      icon: <CheckCircle2 size={12} />,
      label: t('history.confirmed'),
    },
    failed: {
      bg: 'rgba(239, 68, 68, 0.12)',
      color: '#ef4444',
      icon: <XCircle size={12} />,
      label: t('history.failed'),
    },
  };
  const s = styles[status];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: s.bg,
      color: s.color,
    }}>
      {s.icon}{s.label}
    </span>
  );
}

export function History() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const activeChainId = useWalletStore(s => s.activeChainId);
  const accounts = useWalletStore(s => s.accounts);
  const fromAccount = accounts.find(a => a.chainId === activeChainId);
  const activeChain = CHAIN_CONFIGS.find(c => c.chainId === activeChainId);
  const adapter = chainRegistry.get(activeChainId);

  const { transactions, loading, error, refresh } = useTransactionHistory(
    activeChainId,
    fromAccount?.address,
  );

  // Periodic refresh while we have pending txs — explorer picks them up ~10-30s after broadcast
  const hasPending = transactions.some(t => t.status === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => refresh(), 15000);
    return () => clearInterval(timer);
  }, [hasPending, refresh]);

  const getExplorerUrl = (txHash: string) => adapter?.getExplorerTxUrl?.(txHash) ?? null;

  function formatAmount(tx: TransactionRecord): { text: string; symbol: string; isPositive: boolean } {
    if (tx.tokenSymbol) {
      // ERC20/BEP20/SPL token — use tokenDecimals from explorer (fallback 18)
      const decimals = tx.tokenDecimals ?? 18;
      const amount = formatBalance(tx.value, decimals, 6);
      return { text: amount, symbol: tx.tokenSymbol, isPositive: tx.direction === 'received' };
    }
    const decimals = activeChain?.nativeDecimals ?? 18;
    const amount = formatBalance(tx.value, decimals, 6);
    return { text: amount, symbol: activeChain?.nativeSymbol ?? '', isPositive: tx.direction === 'received' };
  }

  const cardStyle: React.CSSProperties = {
    maxWidth: 720,
    margin: '0 auto',
    padding: 'var(--ow-space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-4)',
    marginTop: '5vh',
  };

  const listItemStyle = (status: TransactionRecord['status']): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    backgroundColor: status === 'pending' ? 'rgba(245, 158, 11, 0.04)' : 'var(--ow-bg-secondary)',
    borderRadius: 'var(--ow-radius-lg)',
    border: status === 'pending' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid var(--ow-border)',
    transition: 'background-color 150ms',
  });

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-3)' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <div style={{ flex: 1, fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>{t('history.title')}</div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </Button>
      </div>

      {/* Chain label */}
      <div style={{ fontSize: 13, color: 'var(--ow-text-secondary)' }}>
        {activeChain?.name ?? activeChainId} · {fromAccount ? truncateHash(fromAccount.address) : '—'}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: 'var(--ow-space-3) var(--ow-space-4)',
          borderRadius: 'var(--ow-radius-lg)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
          fontSize: 'var(--ow-font-size-sm)',
        }}>
          {t('history.failedToLoad', { error })}
          <Button variant="ghost" size="sm" onClick={refresh} style={{ marginLeft: 'auto', display: 'block' }}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && transactions.length === 0 && (
        <div style={{
          backgroundColor: 'var(--ow-bg-secondary)',
          borderRadius: 'var(--ow-radius-xl)',
          border: '1px solid var(--ow-border)',
          padding: 'var(--ow-space-12)',
          textAlign: 'center',
          color: 'var(--ow-text-secondary)',
        }}>
          <div style={{ fontSize: 'var(--ow-font-size-lg)', fontWeight: 600, marginBottom: 'var(--ow-space-2)', color: 'var(--ow-text-primary)' }}>
            {t('history.noTxTitle')}
          </div>
          <div style={{ fontSize: 'var(--ow-font-size-sm)', marginBottom: 'var(--ow-space-4)' }}>
            {t('history.noTxDesc', { chain: activeChain?.name ?? '' })}
          </div>
          <Button onClick={() => navigate('/send')}>{t('history.send', { symbol: activeChain?.nativeSymbol ?? '' })}</Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && transactions.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              height: 58,
              borderRadius: 'var(--ow-radius-lg)',
              backgroundColor: 'var(--ow-bg-secondary)',
              border: '1px solid var(--ow-border)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
      )}

      {/* Transaction list */}
      {transactions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {transactions.map(tx => {
            const amt = formatAmount(tx);
            const explorerUrl = getExplorerUrl(tx.hash);
            const isTokenTransfer = !!tx.tokenSymbol;

            return (
              <div key={tx.hash} style={listItemStyle(tx.status)}>
                {/* Left: direction icon + status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: tx.direction === 'sent' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: tx.direction === 'sent' ? '#ef4444' : '#10b981',
                  }}>
                    {tx.direction === 'sent' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {isTokenTransfer ? (
                          tx.direction === 'sent' ? t('history.sentToken', { symbol: tx.tokenSymbol }) : t('history.receivedToken', { symbol: tx.tokenSymbol })
                        ) : (
                          tx.direction === 'sent' ? t('history.sent') : t('history.received')
                        )}
                      </span>
                      <StatusBadge status={tx.status} t={t} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ow-text-secondary)' }}>
                      {formatTime(tx.blockTimestamp, t)}
                      {explorerUrl && (
                        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" style={{
                          marginLeft: 6,
                          color: 'var(--ow-text-secondary)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                        }}>
                          {truncateHash(tx.hash)}
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: amount */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: amt.isPositive ? '#10b981' : 'var(--ow-text-primary)',
                  }}>
                    {amt.isPositive ? '+' : '-'}{amt.text}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ow-text-secondary)' }}>
                    {amt.symbol}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {transactions.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ow-text-secondary)', textAlign: 'center', marginTop: 'var(--ow-space-2)' }}>
          {t('history.showing', { count: transactions.length })}
          {hasPending && <span style={{ marginLeft: 6, color: '#f59e0b' }}>{t('history.autoRefreshing')}</span>}
        </div>
      )}
    </div>
  );
}
