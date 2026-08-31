/**
 * Send page — supports native + ERC20/BEP20 token transfers on EVM chains.
 *
 * Lifecycle:
 *   1. Choose token mode: Native (gas token) or ERC20 (by contract address)
 *   2. Enter recipient + amount → real-time validation
 *   3. Fee auto-estimated (handles ERC20 calldata gas correctly)
 *   4. Review → Build → Sign → Broadcast → Poll confirm
 *
 * ERC20 flow detail:
 *   - User enters token contract address → we read symbol/decimals/name on-chain
 *   - Transfer calldata is built via adapter.encodeErc20Transfer()
 *   - RawTransaction: to = token contract, value = "0", data = transfer calldata
 *   - Everything else (gas estimate, sign, broadcast, explorer history)
 *     works unchanged — the EVM adapter already handles data fields.
 *
 * Security:
 *   - Private key derived ONLY at signing time, wiped immediately after
 *   - Address validated via EIP-55 checksum before signing
 *   - Amount ≤ available balance enforced before broadcast
 *   - On the ERC20 path we always call .transfer() (no infinite approval flow)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, XCircle, Coins, Wallet, ChevronDown, ListPlus } from 'lucide-react';
import { Button, Input, Modal } from '@open-wallet/ui';
import { chainRegistry, getPrivateKey, isUnlocked, touchActivity } from '@open-wallet/core';
import { useWalletStore } from '../store/wallet.js';
import { CHAIN_CONFIGS } from '@open-wallet/chains';
import { formatBalance } from '@open-wallet/shared';
import type { TransactionRecord, TokenBalance } from '@open-wallet/shared';

type TxStatus = 'idle' | 'estimating' | 'ready' | 'building' | 'signing' | 'broadcasting' | 'pending' | 'confirmed' | 'failed';
type TokenMode = 'native' | 'erc20';

interface Erc20Info {
  symbol: string;
  decimals: number;
  name: string;
  address: string;
}

export function Send() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tokenMode, setTokenMode] = useState<TokenMode>('native');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // ERC20-specific state
  const [erc20Address, setErc20Address] = useState('');
  const [tokenInfo, setTokenInfo] = useState<Erc20Info | null>(null);
  const [tokenInfoLoading, setTokenInfoLoading] = useState(false);
  const [tokenInfoError, setTokenInfoError] = useState<string | null>(null);

  // Held tokens list (for dropdown selection), and manual-input toggle
  const [heldTokens, setHeldTokens] = useState<TokenBalance[]>([]);
  const [heldTokensLoading, setHeldTokensLoading] = useState(false);
  const [selectedHeldToken, setSelectedHeldToken] = useState<TokenBalance | null>(null);
  const [manualTokenInput, setManualTokenInput] = useState(false);

  // Token search filter state
  const [tokenSearch, setTokenSearch] = useState('');
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);

  const [feeInfo, setFeeInfo] = useState<{
    nativeFee: string;
    rawFee: string;
    gasLimit: string;
    gasPrice: string;
  } | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [validationError, setValidationError] = useState('');

  const activeChainId = useWalletStore(s => s.activeChainId);
  const accounts = useWalletStore(s => s.accounts);
  const addPendingTx = useWalletStore(s => s.addPendingTx);
  const removePendingTx = useWalletStore(s => s.removePendingTx);
  const fromAccount = accounts.find(a => a.chainId === activeChainId);

  const adapter = chainRegistry.get(activeChainId);
  const activeChain = CHAIN_CONFIGS.find(c => c.chainId === activeChainId);

  // ── Resolve which token we're sending ──────────────────────────────
  const sendToken = useMemo(() => {
    if (tokenMode === 'erc20' && tokenInfo) {
      return {
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        isNative: false,
        address: tokenInfo.address,
      };
    }
    return {
      symbol: activeChain?.nativeSymbol ?? '',
      decimals: activeChain?.nativeDecimals ?? 18,
      isNative: true,
      address: 'native',
    };
  }, [tokenMode, tokenInfo, activeChain]);

  // ── Fetch held tokens (for dropdown) when entering ERC20 mode ─────
  useEffect(() => {
    if (tokenMode !== 'erc20' || !adapter || !fromAccount) {
      setHeldTokens([]);
      return;
    }
    let cancelled = false;
    setHeldTokensLoading(true);
    adapter.getAllTokenBalances(fromAccount.address)
      .then(list => {
        if (cancelled) return;
        // Filter to non-native tokens with balance > 0
        const erc20 = list.filter(t => !t.isNative && BigInt(t.balance || '0') > 0n);
        setHeldTokens(erc20);
        // Auto-select first token if we have any
        if (erc20.length > 0 && !selectedHeldToken && !manualTokenInput) {
          handleSelectHeldToken(erc20[0]);
        }
      })
      .catch(() => { if (!cancelled) setHeldTokens([]); })
      .finally(() => { if (!cancelled) setHeldTokensLoading(false); });
    return () => { cancelled = true; };
  }, [tokenMode, adapter, fromAccount?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Select a held token from dropdown → prefill tokenInfo ──────────
  const handleSelectHeldToken = useCallback((t: TokenBalance) => {
    setSelectedHeldToken(t);
    setManualTokenInput(false);
    setErc20Address(t.address);
    setTokenInfo({
      symbol: t.symbol,
      decimals: t.decimals,
      name: t.name,
      address: t.address,
    });
    setTokenInfoError(null);
    setAmount(''); // reset amount when switching token
    setTokenSearch('');
    setTokenDropdownOpen(false);
  }, []);

  // ── Filter held tokens by search query ──────────────────────────────
  const filteredHeldTokens = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();
    if (!q) return heldTokens;
    return heldTokens.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    );
  }, [heldTokens, tokenSearch]);

  // ── Smart balance formatting: big balances → fewer decimals ─────────
  const formatTokenBalance = useCallback((raw: string, decimals: number): string => {
    const value = Number(formatBalance(raw, decimals, 8));
    if (value === 0) return '0';
    if (value >= 1000) return formatBalance(raw, decimals, 2);
    if (value >= 1) return formatBalance(raw, decimals, 4);
    return formatBalance(raw, decimals, 6);
  }, []);

  // ── Load ERC20 token info when contract address changes ────────────
  useEffect(() => {
    if (tokenMode !== 'erc20') {
      setTokenInfo(null);
      setTokenInfoError(null);
      return;
    }

    if (!adapter || !erc20Address) {
      setTokenInfo(null);
      setTokenInfoError(null);
      return;
    }

    if (!adapter.validateAddress(erc20Address)) {
      setTokenInfo(null);
      setTokenInfoError(t('send.invalidContractAddress'));
      return;
    }

    let cancelled = false;
    setTokenInfoLoading(true);
    setTokenInfoError(null);

    // Debounce: wait 400ms before hitting RPC
    const timer = setTimeout(async () => {
      try {
        const info = await (adapter as unknown as {
          getTokenInfo: (addr: string) => Promise<Erc20Info>;
        }).getTokenInfo(erc20Address);
        if (cancelled) return;
        setTokenInfo({ ...info, address: erc20Address });
      } catch {
        if (cancelled) return;
        setTokenInfo(null);
        setTokenInfoError(t('send.notValidToken'));
      } finally {
        if (!cancelled) setTokenInfoLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tokenMode, erc20Address, adapter]);

  // ── Load balance: native or token ───────────────────────────────────
  useEffect(() => {
    if (!fromAccount || !adapter) return;

    if (tokenMode === 'native') {
      adapter.getNativeBalance(fromAccount.address)
        .then(b => setBalance(b))
        .catch(() => setBalance('0'));
    } else if (tokenMode === 'erc20' && tokenInfo) {
      adapter.getTokenBalance(fromAccount.address, tokenInfo.address)
        .then(b => setBalance(b))
        .catch(() => setBalance('0'));
    }
  }, [fromAccount?.address, activeChainId, tokenMode, tokenInfo?.address]);

  // ── Validate amount format: must be "digits[.digits]" ──────────────
  const isValidAmountFormat = (v: string): boolean => {
    if (!v) return false;
    if (!/^\d*\.?\d+$/.test(v)) return false;
    const cleaned = v.replace(/[.]/g, '');
    if (/^0+$/.test(cleaned)) return false;
    return true;
  };

  // ── Real-time amount validation + fee estimation ─────────────────
  useEffect(() => {
    setFeeInfo(null);
    setValidationError('');

    if (!adapter || !fromAccount || !activeChain) {
      setValidationError(t('send.walletNotReady'));
      return;
    }

    // Address validation (ERC20 path must also validate recipient)
    if (toAddress && !adapter.validateAddress(toAddress)) {
      setValidationError(t('send.invalidAddress'));
      return;
    }

    // ERC20 contract must be valid and loaded
    if (tokenMode === 'erc20' && !tokenInfo) {
      if (tokenInfoError) {
        setValidationError(tokenInfoError);
      } else if (erc20Address && !tokenInfoLoading) {
        setValidationError(t('send.invalidContractAddress'));
      }
      return;
    }

    // Amount format validation
    if (amount && !isValidAmountFormat(amount)) {
      setValidationError(t('send.invalidAmount'));
      return;
    }

    // Parse raw amount with correct decimals
    let rawAmount = '';
    if (amount) {
      try {
        if (sendToken.isNative) {
          rawAmount = adapter.parseAmount(amount);
        } else {
          rawAmount = (adapter as unknown as {
            parseTokenAmount: (a: string, d: number) => string;
          }).parseTokenAmount(amount, sendToken.decimals);
        }
      } catch {
        setValidationError(t('send.invalidAmount'));
        return;
      }
      if (BigInt(rawAmount) <= 0n) {
        setValidationError(t('send.amountMustBePositive'));
        return;
      }
      if (BigInt(rawAmount) > BigInt(balance)) {
        setValidationError(t('send.amountExceeds'));
        return;
      }
    }

    // Fee estimation — needs valid to + positive amount
    if (toAddress && adapter.validateAddress(toAddress) && rawAmount && BigInt(rawAmount) > 0n) {
      void estimateFee();
    }

    async function estimateFee() {
      setStatus(s => s === 'broadcasting' || s === 'pending' ? s : 'estimating');
      try {
        // Build a tentative raw tx for fee estimation
        let estimateParams: { from: string; to: string; value: string; data?: string };
        if (sendToken.isNative) {
          estimateParams = {
            from: fromAccount!.address,
            to: toAddress,
            value: rawAmount,
          };
        } else {
          // ERC20: to = contract, value = 0, data = transfer calldata
          const data = (adapter as unknown as {
            encodeErc20Transfer: (contract: string, to: string, amount: string) => string;
          }).encodeErc20Transfer(sendToken.address, toAddress, rawAmount);
          estimateParams = {
            from: fromAccount!.address,
            to: sendToken.address,
            value: '0',
            data,
          };
        }

        const fees = await adapter!.estimateFees(estimateParams);
        const formattedFee = formatBalance(fees.totalFee, activeChain!.nativeDecimals, 8);
        setFeeInfo({
          nativeFee: formattedFee,
          rawFee: fees.totalFee,
          gasLimit: fees.gasLimit,
          gasPrice: fees.gasPrice,
        });
        setStatus('ready');
      } catch {
        setValidationError(t('send.couldNotEstimateFee'));
        setStatus('idle');
      }
    }
  }, [toAddress, amount, adapter, fromAccount, activeChain, tokenMode, erc20Address, tokenInfo, sendToken, balance, tokenInfoLoading, tokenInfoError]);

  // ── Poll transaction confirmation ─────────────────────────────────
  useEffect(() => {
    if (status !== 'pending' || !txHash || !adapter) return;
    if (!isUnlocked()) { setTxError(t('send.walletLockedBeforeConfirm')); return; }

    const poll = async () => {
      try {
        const result = await adapter!.getTransactionStatus(txHash!);
        if (result === 'confirmed') {
          removePendingTx(activeChainId, txHash!);
          setStatus('confirmed');
        } else if (result === 'failed') {
          removePendingTx(activeChainId, txHash!);
          setStatus('failed');
          setTxError(t('send.txReverted'));
        }
      } catch {
        // keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [status, txHash, adapter, activeChainId, removePendingTx]);

  // ── Main send handler ──────────────────────────────────────────────
  const handleSend = async () => {
    if (!adapter || !fromAccount) {
      setTxError(t('send.walletNotReady'));
      return;
    }

    // ERC20 preconditions
    if (tokenMode === 'erc20' && !tokenInfo) {
      setTxError(t('send.tokenNotLoaded'));
      return;
    }

    setShowConfirm(false);
    setTxError(null);

    const sendAdapter = adapter as unknown as {
      parseTokenAmount: (a: string, d: number) => string;
      encodeErc20Transfer: (contract: string, to: string, amount: string) => string;
    };

    // Parse amount in the correct unit
    let rawAmount: string;
    if (sendToken.isNative) {
      rawAmount = adapter.parseAmount(amount);
    } else {
      rawAmount = sendAdapter.parseTokenAmount(amount, sendToken.decimals);
    }

    try {
      // 1) Build the raw tx (gas + nonce filled by adapter)
      setStatus('building');

      let buildParams: { from: string; to: string; value: string; data?: string };
      if (sendToken.isNative) {
        buildParams = {
          from: fromAccount.address,
          to: toAddress,
          value: rawAmount,
        };
      } else {
        buildParams = {
          from: fromAccount.address,
          to: sendToken.address,          // tx TO = ERC20 contract
          value: '0',                      // no native value sent
          data: sendAdapter.encodeErc20Transfer(sendToken.address, toAddress, rawAmount),
        };
      }

      const rawTx = await adapter.buildTransaction(buildParams);

      // 2) Sign — transient private key
      setStatus('signing');
      touchActivity();
      const privateKey = getPrivateKey(fromAccount);
      try {
        const signed = await adapter.signTransaction(rawTx, privateKey);

        // 3) Broadcast
        setStatus('broadcasting');
        const hash = await adapter.sendTransaction(signed);
        setTxHash(hash);

        // 4) Add local pending entry
        const localTx: TransactionRecord = {
          hash,
          from: fromAccount.address,
          to: sendToken.isNative ? toAddress : sendToken.address,
          value: rawAmount,
          blockNumber: 0,
          blockTimestamp: Math.floor(Date.now() / 1000),
          status: 'pending',
          direction: 'sent',
          fee: feeInfo?.rawFee,
          // Fill ERC20 metadata so Home/History display correctly
          ...(sendToken.isNative ? {} : {
            tokenSymbol: sendToken.symbol,
            tokenAddress: sendToken.address,
            tokenDecimals: sendToken.decimals,
          }),
        };
        addPendingTx(activeChainId, localTx);

        setStatus('pending');
      } finally {
        if ('fill' in privateKey) privateKey.fill(0);
      }
    } catch (e) {
      setTxError((e as Error).message);
      setStatus('failed');
    }
  };

  // ── Max button ──────────────────────────────────────────────────────
  const useMax = () => {
    if (!fromAccount || !sendToken || !activeChain) return;

    if (sendToken.isNative) {
      // Native: balance - fee
      const bal = BigInt(balance);
      const fee = feeInfo ? BigInt(feeInfo.rawFee) : 0n;
      const maxRaw = bal > fee ? bal - fee : 0n;
      setAmount(formatBalance(maxRaw.toString(), sendToken.decimals, 8));
    } else {
      // ERC20: can send full balance (token transfer gas is separate)
      setAmount(formatBalance(balance, sendToken.decimals, 8));
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: '0 auto',
    padding: 'var(--ow-space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-4)',
    marginTop: '5vh',
  };

  // ── Final outcome modal ────────────────────────────────────────────
  if (status === 'confirmed' || status === 'failed') {
    const isOk = status === 'confirmed';
    return (
      <div style={cardStyle}>
        <Modal
          open={true}
          onClose={() => { setTxHash(null); navigate('/'); }}
          title={isOk ? t('send.txConfirmed') : t('send.txFailed')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ow-space-3)', alignItems: 'center' }}>
            {isOk
              ? <CheckCircle2 size={48} color="var(--ow-success)" />
              : <XCircle size={48} color="var(--ow-error)" />}
            <div style={{ fontSize: 'var(--ow-font-size-sm)', color: 'var(--ow-text-tertiary)' }}>
              {isOk ? t('send.txConfirmedDesc') : (txError ?? t('send.txFailedDesc'))}
            </div>
            {txHash && (
              <div style={{
                fontFamily: 'var(--ow-font-mono)',
                fontSize: 'var(--ow-font-size-xs)',
                wordBreak: 'break-all',
                backgroundColor: 'var(--ow-bg-tertiary)',
                padding: 'var(--ow-space-3)',
                borderRadius: 'var(--ow-radius-md)',
                border: '1px solid var(--ow-border-subtle)',
              }}>
                {txHash}
              </div>
            )}
          </div>
        </Modal>
      </div>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────
  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-3)' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} disabled={status === 'pending'}>
          <ArrowLeft size={16} />
        </Button>
        <div style={{ fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>{t('send.title')}</div>
        <div style={{ marginLeft: 'auto', fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)' }}>
          {activeChain?.name}
        </div>
      </div>

      {/* ── Token selector tabs ────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 2,
        backgroundColor: 'var(--ow-bg-secondary)',
        borderRadius: 'var(--ow-radius-md)',
        padding: 2,
      }}>
        <button
          onClick={() => { setTokenMode('native'); setTokenInfo(null); setErc20Address(''); }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 'var(--ow-radius-md)',
            cursor: 'pointer',
            fontSize: 'var(--ow-font-size-sm)',
            fontWeight: tokenMode === 'native' ? 600 : 400,
            backgroundColor: tokenMode === 'native' ? 'var(--ow-bg-primary)' : 'transparent',
            color: tokenMode === 'native' ? 'var(--ow-text-primary)' : 'var(--ow-text-secondary)',
            transition: 'background-color 150ms',
          }}
        >
          <Wallet size={14} /> {t('send.native')}
        </button>
        <button
          onClick={() => setTokenMode('erc20')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 'var(--ow-radius-md)',
            cursor: 'pointer',
            fontSize: 'var(--ow-font-size-sm)',
            fontWeight: tokenMode === 'erc20' ? 600 : 400,
            backgroundColor: tokenMode === 'erc20' ? 'var(--ow-bg-primary)' : 'transparent',
            color: tokenMode === 'erc20' ? 'var(--ow-text-primary)' : 'var(--ow-text-secondary)',
            transition: 'background-color 150ms',
          }}
        >
          <Coins size={14} /> {t('send.erc20')}
        </button>
      </div>

      {/* ── ERC20 token selector: dropdown or manual input ───────────── */}
      {tokenMode === 'erc20' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Toggle row */}
          {heldTokens.length > 0 && !heldTokensLoading && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <button
                onClick={() => { setManualTokenInput(false); setSelectedHeldToken(null); }}
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '6px 10px',
                  border: 'none', borderRadius: 'var(--ow-radius-sm)',
                  fontSize: 'var(--ow-font-size-xs)',
                  cursor: 'pointer',
                  backgroundColor: !manualTokenInput ? 'var(--ow-bg-tertiary)' : 'transparent',
                  color: !manualTokenInput ? 'var(--ow-text-primary)' : 'var(--ow-text-tertiary)',
                  fontWeight: !manualTokenInput ? 600 : 400,
                }}
              >
                <Coins size={12} /> {t('send.heldTokens', { count: heldTokens.length })}
              </button>
              <button
                onClick={() => { setManualTokenInput(true); setSelectedHeldToken(null); setTokenInfo(null); }}
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '6px 10px',
                  border: 'none', borderRadius: 'var(--ow-radius-sm)',
                  fontSize: 'var(--ow-font-size-xs)',
                  cursor: 'pointer',
                  backgroundColor: manualTokenInput ? 'var(--ow-bg-tertiary)' : 'transparent',
                  color: manualTokenInput ? 'var(--ow-text-primary)' : 'var(--ow-text-tertiary)',
                  fontWeight: manualTokenInput ? 600 : 400,
                }}
              >
                <ListPlus size={12} /> {t('send.customAddress')}
              </button>
            </div>
          )}

          {/* Held tokens dropdown (searchable) */}
          {!manualTokenInput && heldTokens.length > 0 && (
            <div>
              <label style={{ fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)' }}>
                {t('send.selectToken')}
              </label>
              <div style={{ position: 'relative', marginTop: 4 }}>
                {/* Search / selection input */}
                <div style={{ position: 'relative' }}>
                  <input
                    value={tokenSearch}
                    placeholder={selectedHeldToken
                      ? `${selectedHeldToken.symbol} · ${formatTokenBalance(selectedHeldToken.balance, selectedHeldToken.decimals)}`
                      : t('send.searchPlaceholder')}
                    onFocus={() => setTokenDropdownOpen(true)}
                    onChange={e => {
                      const v = e.target.value;
                      setTokenSearch(v);
                      setTokenDropdownOpen(true);
                      // If the query looks like a 0x contract address, surface
                      // it into the manual-input mode automatically
                      if (/^0x[a-fA-F0-9]{6,}$/.test(v.trim())) {
                        setErc20Address(v.trim());
                      }
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--ow-bg-secondary)',
                      color: 'var(--ow-text-primary)',
                      border: `1px solid ${tokenInfoError ? 'var(--ow-error)' : 'var(--ow-border)'}`,
                      borderRadius: 'var(--ow-radius-md)',
                      padding: '10px 32px 10px 12px',
                      fontSize: 'var(--ow-font-size-sm)',
                      outline: 'none',
                    }}
                  />
                  <ChevronDown
                    size={14}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ow-text-tertiary)', pointerEvents: 'none' }}
                  />
                </div>

                {/* Dropdown list */}
                {tokenDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    maxHeight: 240,
                    overflowY: 'auto',
                    backgroundColor: 'var(--ow-bg-secondary)',
                    border: '1px solid var(--ow-border)',
                    borderRadius: 'var(--ow-radius-md)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    zIndex: 100,
                  }}>
                    {filteredHeldTokens.length === 0 ? (
                      <div style={{ padding: 'var(--ow-space-3)', fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)', textAlign: 'center' }}>
                        {/^0x[a-fA-F0-9]{6,}$/.test(tokenSearch.trim())
                          ? <div onClick={() => { setManualTokenInput(true); setErc20Address(tokenSearch.trim()); setTokenInfo(null); setTokenDropdownOpen(false); }}
                              style={{ color: 'var(--ow-info)', cursor: 'pointer', fontWeight: 600 }}>
                              {t('send.loadTokenAt', { addr: tokenSearch.trim().slice(0, 10) })}
                            </div>
                          : t('send.noTokensMatch', { query: tokenSearch })}
                      </div>
                    ) : (
                      filteredHeldTokens.map(t => (
                        <div
                          key={t.address}
                          onClick={() => handleSelectHeldToken(t)}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--ow-bg-tertiary)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--ow-border-subtle)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                              backgroundColor: 'var(--ow-bg-tertiary)',
                              border: '1px solid var(--ow-border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, fontFamily: 'var(--ow-font-mono)',
                              color: 'var(--ow-text-secondary)',
                            }}>
                              {t.symbol.slice(0, 3).toUpperCase()}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 'var(--ow-font-size-sm)', fontWeight: 600 }}>
                                {t.symbol}
                                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ow-text-tertiary)', fontFamily: 'var(--ow-font-mono)' }}>
                                  {t.address.slice(0, 6)}…{t.address.slice(-4)}
                                </span>
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--ow-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {t.name}
                              </div>
                            </div>
                          </div>
                          <div style={{ fontSize: 'var(--ow-font-size-sm)', fontFamily: 'var(--ow-font-mono)', flexShrink: 0 }}>
                            {formatTokenBalance(t.balance, t.decimals)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Held tokens empty state */}
          {!manualTokenInput && heldTokens.length === 0 && !heldTokensLoading && (
            <div style={{
              padding: 'var(--ow-space-3)',
              backgroundColor: 'var(--ow-bg-secondary)',
              border: '1px dashed var(--ow-border-subtle)',
              borderRadius: 'var(--ow-radius-md)',
              fontSize: 'var(--ow-font-size-xs)',
              color: 'var(--ow-text-tertiary)',
              textAlign: 'center',
            }}>
              {t('send.noTokensFound')}
            </div>
          )}

          {/* Manual contract address input */}
          {(manualTokenInput || (heldTokens.length === 0 && !heldTokensLoading)) && (
            <Input
              label={t('send.tokenContractLabel')}
              placeholder={t('send.tokenContractPlaceholder')}
              value={erc20Address}
              onChange={e => { setErc20Address(e.target.value); setTokenInfo(null); }}
              error={tokenInfoError ?? undefined}
            />
          )}

          {tokenInfoLoading && (
            <div style={{
              fontSize: 'var(--ow-font-size-xs)',
              color: 'var(--ow-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> {t('send.readingTokenInfo')}
            </div>
          )}
          {tokenInfo && (
            <div style={{
              fontSize: 'var(--ow-font-size-xs)',
              color: 'var(--ow-success)',
            }}>
              {t('send.tokenLoaded', { name: tokenInfo.name || tokenInfo.symbol, symbol: tokenInfo.symbol, decimals: tokenInfo.decimals })}
            </div>
          )}
        </div>
      )}

      {/* ── From address + balance ──────────────────────────────────── */}
      {fromAccount && (
        <div style={{
          backgroundColor: 'var(--ow-bg-secondary)',
          padding: 'var(--ow-space-3)',
          borderRadius: 'var(--ow-radius-md)',
          border: '1px solid var(--ow-border-subtle)',
          fontSize: 'var(--ow-font-size-xs)',
        }}>
          <div style={{ color: 'var(--ow-text-tertiary)', marginBottom: 'var(--ow-space-1)' }}>
            {t('send.from')}
          </div>
          <div style={{ fontFamily: 'var(--ow-font-mono)', wordBreak: 'break-all' }}>
            {fromAccount.address}
          </div>
          <div style={{ color: 'var(--ow-text-secondary)', marginTop: 'var(--ow-space-2)' }}>
            {t('send.balance', { amount: formatBalance(balance, sendToken.decimals, 8), symbol: sendToken.symbol })}
            {!sendToken.isNative && activeChain && (
              <span style={{ color: 'var(--ow-text-tertiary)', marginLeft: 8 }}>
                {t('send.gasHint', { amount: formatBalance(BigInt(adapter?.parseAmount?.('0.1') ?? '100000000000000000'), activeChain.nativeDecimals, 4) || '0', symbol: activeChain.nativeSymbol })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Recipient ────────────────────────────────────────────────── */}
      <Input
        label={t('send.recipientLabel')}
        placeholder={t('send.recipientPlaceholder')}
        value={toAddress}
        onChange={e => setToAddress(e.target.value)}
        error={toAddress && adapter && !adapter.validateAddress(toAddress)
          ? t('send.invalidAddress')
          : undefined}
      />

      {/* ── Amount + Max ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--ow-space-2)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Input
            label={t('send.amountLabel', { symbol: sendToken.symbol || 'token' })}
            type="text"
            inputMode="decimal"
            placeholder={t('send.amountPlaceholder')}
            value={amount}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9.]/g, '');
              const firstDot = raw.indexOf('.');
              const cleaned = firstDot === -1
                ? raw
                : raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/[.]/g, '');
              setAmount(cleaned);
            }}
            error={validationError || undefined}
            disabled={tokenMode === 'erc20' && !tokenInfo}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={useMax}
          disabled={!balance || balance === '0' || (tokenMode === 'erc20' && !tokenInfo)}
        >
          {t('send.max')}
        </Button>
      </div>

      {/* ── Gas fee row ─────────────────────────────────────────────── */}
      {feeInfo && (
        <div style={{
          backgroundColor: 'var(--ow-bg-secondary)',
          padding: 'var(--ow-space-3)',
          borderRadius: 'var(--ow-radius-md)',
          border: '1px solid var(--ow-border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 'var(--ow-font-size-sm)',
        }}>
          <span style={{ color: 'var(--ow-text-tertiary)' }}>{t('send.networkFee')}</span>
          <span style={{ fontFamily: 'var(--ow-font-mono)' }}>
            {feeInfo.nativeFee} {activeChain?.nativeSymbol}
          </span>
        </div>
      )}
      {status === 'estimating' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-2)', fontSize: 'var(--ow-font-size-sm)', color: 'var(--ow-text-tertiary)' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('send.estimatingFee')}
        </div>
      )}

      {/* ── Build/Sign/Send spinner ──────────────────────────────────── */}
      {(status === 'building' || status === 'signing' || status === 'broadcasting') && (
        <div style={{
          backgroundColor: 'var(--ow-bg-secondary)',
          padding: 'var(--ow-space-4)',
          borderRadius: 'var(--ow-radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--ow-space-2)',
          border: '1px solid var(--ow-border)',
        }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 'var(--ow-font-size-sm)' }}>
            {status === 'building' && t('send.preparing')}
            {status === 'signing' && t('send.signing')}
            {status === 'broadcasting' && t('send.broadcasting')}
          </span>
        </div>
      )}

      {/* ── Pending tx ──────────────────────────────────────────────── */}
      {status === 'pending' && txHash && (
        <div style={{
          backgroundColor: 'var(--ow-bg-secondary)',
          padding: 'var(--ow-space-4)',
          borderRadius: 'var(--ow-radius-md)',
          border: '1px solid var(--ow-info)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-2)', marginBottom: 'var(--ow-space-2)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--ow-info)' }} />
            <span style={{ fontSize: 'var(--ow-font-size-sm)', color: 'var(--ow-info)' }}>
              {t('send.waitingConfirmation')}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--ow-font-mono)', fontSize: 'var(--ow-font-size-xs)', wordBreak: 'break-all', color: 'var(--ow-text-tertiary)' }}>
            {txHash}
          </div>
        </div>
      )}

      {/* ── Review button ────────────────────────────────────────────── */}
      {!showConfirm && !['building', 'signing', 'broadcasting', 'pending'].includes(status) && (
        <Button
          disabled={!!validationError || status !== 'ready' || (tokenMode === 'erc20' && !tokenInfo)}
          onClick={() => setShowConfirm(true)}
          size="lg"
        >
          {t('send.reviewTransaction')} <ArrowRight size={16} />
        </Button>
      )}

      {/* ── Confirmation modal ──────────────────────────────────────── */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={t('send.reviewTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={handleSend} loading={status === 'signing'}>
              {t('send.confirmAndSend')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ow-space-3)' }}>
          <div>
            <strong>{t('send.to')}</strong>{' '}
            <code style={{ wordBreak: 'break-all' }}>{toAddress}</code>
          </div>
          <div>
            <strong>{t('send.amount')}</strong> {amount} {sendToken.symbol}
            {!sendToken.isNative && (
              <span style={{ fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)', marginLeft: 6 }}>
                ({sendToken.address.slice(0, 10)}…{sendToken.address.slice(-8)})
              </span>
            )}
          </div>
          <div><strong>{t('send.fee')}</strong> {feeInfo?.nativeFee} {activeChain?.nativeSymbol}</div>
          {!sendToken.isNative && (
            <div style={{
              fontSize: 'var(--ow-font-size-xs)',
              color: 'var(--ow-text-secondary)',
              padding: 'var(--ow-space-2)',
              backgroundColor: 'var(--ow-bg-tertiary)',
              borderRadius: 'var(--ow-radius-sm)',
            }}>
              {t('send.tokenTransferNote')}
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--ow-border-subtle)', paddingTop: 'var(--ow-space-3)', color: 'var(--ow-error)', fontSize: 'var(--ow-font-size-xs)' }}>
            {t('send.doubleCheck')}
          </div>
        </div>
      </Modal>
    </div>
  );
}
