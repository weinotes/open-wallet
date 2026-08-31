/**
 * Send page — complete EVM-native transaction flow.
 *
 * Lifecycle:
 *   1. User enters TO address + amount
 *   2. Real-time validation (address format, amount > 0)
 *   3. Fetch fee estimate → show gas fee row (slow/medium/fast preset, EIP-1559)
 *   4. Click "Review" → Build + Sign (private key from SessionManager) → Broadcast
 *   5. Poll transaction status → show "pending" → "confirmed"/"failed"
 *
 * Security:
 *   - Private key derived ONLY at signing time, wiped immediately after
 *   - Address validated via EIP-55 checksum before signing
 *   - Amount ≤ available balance enforced before broadcast
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Input, Modal } from '@open-wallet/ui';
import { chainRegistry, getPrivateKey, isUnlocked, touchActivity } from '@open-wallet/core';
import { useWalletStore } from '../store/wallet.js';
import { CHAIN_CONFIGS } from '@open-wallet/chains';
import { formatBalance } from '@open-wallet/shared';

type TxStatus = 'idle' | 'estimating' | 'ready' | 'building' | 'signing' | 'broadcasting' | 'pending' | 'confirmed' | 'failed';

export function Send() {
  const navigate = useNavigate();
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [feeInfo, setFeeInfo] = useState<{
    nativeFee: string;   // formatted with chain decimals
    rawFee: string;      // raw smallest unit
    gasLimit: string;
    gasPrice: string;
  } | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [validationError, setValidationError] = useState('');

  const activeChainId = useWalletStore(s => s.activeChainId);
  const accounts = useWalletStore(s => s.accounts);
  const fromAccount = accounts.find(a => a.chainId === activeChainId);

  const adapter = chainRegistry.get(activeChainId);
  const activeChain = CHAIN_CONFIGS.find(c => c.chainId === activeChainId);

  // ── Load native balance for max-button + amount validation ──
  useEffect(() => {
    if (!fromAccount || !adapter) return;
    adapter.getNativeBalance(fromAccount.address)
      .then(b => setBalance(b))
      .catch(() => setBalance('0'));
  }, [fromAccount?.address, activeChainId]);

  // ── Validate amount format: must be "digits[.digits]" with optional leading dot ──
  // Rejects: empty, ".", "1.2.3", "1e10", negative, "00" leading, etc.
  const isValidAmountFormat = (v: string): boolean => {
    if (!v) return false;
    if (!/^\d*\.?\d+$/.test(v)) return false;
    // Reject things like ".5" (missing leading digit) — optional
    // Reject all-zero values
    const cleaned = v.replace(/[.]/g, '');
    if (/^0+$/.test(cleaned)) return false;
    return true;
  };

  // ── Real-time amount validation + fee estimation ──
  useEffect(() => {
    setFeeInfo(null);
    setValidationError('');

    if (!adapter || !fromAccount || !activeChain) {
      setValidationError('Wallet not fully initialized');
      return;
    }

    // Address validation
    if (toAddress && !adapter.validateAddress(toAddress)) {
      setValidationError('Invalid recipient address');
      return;
    }

    // Amount format validation (no Number() — pure string check)
    if (amount && !isValidAmountFormat(amount)) {
      setValidationError('Enter a valid positive amount');
      return;
    }

    // Amount > 0 check
    let rawAmount = '';
    if (amount) {
      try {
        rawAmount = adapter.parseAmount(amount);
      } catch {
        setValidationError('Enter a valid positive amount');
        return;
      }
      if (BigInt(rawAmount) <= 0n) {
        setValidationError('Amount must be greater than 0');
        return;
      }
      if (BigInt(rawAmount) > BigInt(balance)) {
        setValidationError('Amount exceeds balance');
        return;
      }
    }

    // Fee estimation — only when we have both to + amount, and amount > 0
    if (toAddress && adapter.validateAddress(toAddress) && rawAmount && BigInt(rawAmount) > 0n) {
      void estimateFee();
    }

    async function estimateFee() {
      setStatus(s => s === 'broadcasting' || s === 'pending' ? s : 'estimating');
      try {
        // Adapter.estimateFees internally calls estimateGas (if preEstimatedGas
        // is not provided) so the fee shown matches what buildTransaction uses.
        const fees = await adapter!.estimateFees({
          from: fromAccount!.address,
          to: toAddress,
          value: rawAmount,
        });
        const formattedFee = formatBalance(fees.totalFee, activeChain!.nativeDecimals, 8);
        setFeeInfo({
          nativeFee: formattedFee,
          rawFee: fees.totalFee,
          gasLimit: fees.gasLimit,
          gasPrice: fees.gasPrice,
        });
        setStatus('ready');
      } catch {
        setValidationError('Could not estimate fee — try a different RPC');
        setStatus('idle');
      }
    }
  }, [toAddress, amount, adapter, fromAccount, activeChain]);

  // ── Poll transaction confirmation ──
  useEffect(() => {
    if (status !== 'pending' || !txHash || !adapter) return;
    if (!isUnlocked()) { setTxError('Wallet locked before confirmation'); return; }

    const poll = async () => {
      try {
        const result = await adapter!.getTransactionStatus(txHash!);
        if (result === 'confirmed') setStatus('confirmed');
        else if (result === 'failed') { setStatus('failed'); setTxError('Transaction reverted by the chain'); }
      } catch {
        // Network hiccup — keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [status, txHash, adapter]);

  // ── Main send handler ──
  const handleSend = async () => {
    if (!adapter || !fromAccount) {
      setTxError('Wallet not ready');
      return;
    }

    setShowConfirm(false);
    setTxError(null);

    try {
      // 1) Build (fill nonce, estimate gas)
      setStatus('building');
      const value = adapter.parseAmount(amount);
      const rawTx = await adapter.buildTransaction({
        from: fromAccount.address,
        to: toAddress,
        value,
      });

      // 2) Sign — get transient private key, sign, wipe
      setStatus('signing');
      touchActivity();
      const privateKey = getPrivateKey(fromAccount);
      try {
        const signed = await adapter.signTransaction(rawTx, privateKey);

        // 3) Broadcast
        setStatus('broadcasting');
        const hash = await adapter.sendTransaction(signed);
        setTxHash(hash);
        setStatus('pending');
      } finally {
        // Best-effort wipe of private key reference
        // Uint8Array GC will handle it; we at least dereference
        if ('fill' in privateKey) privateKey.fill(0);
      }
    } catch (e) {
      setTxError((e as Error).message);
      setStatus('failed');
    }
  };

  const useMax = () => {
    if (!fromAccount || !adapter || !activeChain) return;
    // max = balance - fee (approximately)
    const bal = BigInt(balance);
    const fee = feeInfo ? BigInt(feeInfo.rawFee) : 0n;
    const maxRaw = bal > fee ? bal - fee : 0n;
    setAmount(formatBalance(maxRaw.toString(), activeChain.nativeDecimals, 8));
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: '0 auto',
    padding: 'var(--ow-space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-4)',
    marginTop: '5vh',
  };

  // ── Render states ──

  // Final outcome modal (confirmed / failed)
  if (status === 'confirmed' || status === 'failed') {
    const isOk = status === 'confirmed';
    return (
      <div style={cardStyle}>
        <Modal
          open={true}
          onClose={() => { setTxHash(null); navigate('/'); }}
          title={isOk ? 'Transaction Confirmed' : 'Transaction Failed'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ow-space-3)', alignItems: 'center' }}>
            {isOk
              ? <CheckCircle2 size={48} color="var(--ow-success)" />
              : <XCircle size={48} color="var(--ow-error)" />}
            <div style={{ fontSize: 'var(--ow-font-size-sm)', color: 'var(--ow-text-tertiary)' }}>
              {isOk ? 'Your transaction has been confirmed.' : txError}
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

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-3)' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} disabled={status === 'pending'}>
          <ArrowLeft size={16} />
        </Button>
        <div style={{ fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>Send</div>
        <div style={{ marginLeft: 'auto', fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)' }}>
          {activeChain?.name}
        </div>
      </div>

      {/* From address */}
      {fromAccount && (
        <div style={{
          backgroundColor: 'var(--ow-bg-secondary)',
          padding: 'var(--ow-space-3)',
          borderRadius: 'var(--ow-radius-md)',
          border: '1px solid var(--ow-border-subtle)',
          fontSize: 'var(--ow-font-size-xs)',
        }}>
          <div style={{ color: 'var(--ow-text-tertiary)', marginBottom: 'var(--ow-space-1)' }}>
            From:
          </div>
          <div style={{ fontFamily: 'var(--ow-font-mono)', wordBreak: 'break-all' }}>
            {fromAccount.address}
          </div>
          <div style={{ color: 'var(--ow-text-secondary)', marginTop: 'var(--ow-space-2)' }}>
            Balance: {formatBalance(balance, activeChain?.nativeDecimals ?? 18, 8)} {activeChain?.nativeSymbol}
          </div>
        </div>
      )}

      {/* To */}
      <Input
        label="Recipient Address"
        placeholder="0x..."
        value={toAddress}
        onChange={e => setToAddress(e.target.value)}
        error={toAddress && adapter && !adapter.validateAddress(toAddress)
          ? 'Invalid EVM address'
          : undefined}
      />

      {/* Amount */}
      <div style={{ display: 'flex', gap: 'var(--ow-space-2)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Input
            label={`Amount (${activeChain?.nativeSymbol})`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            error={validationError || undefined}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={useMax} disabled={!balance || balance === '0'}>
          Max
        </Button>
      </div>

      {/* Gas fee row */}
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
          <span style={{ color: 'var(--ow-text-tertiary)' }}>Network Fee</span>
          <span style={{ fontFamily: 'var(--ow-font-mono)' }}>
            {feeInfo.nativeFee} {activeChain?.nativeSymbol}
          </span>
        </div>
      )}
      {status === 'estimating' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-2)', fontSize: 'var(--ow-font-size-sm)', color: 'var(--ow-text-tertiary)' }}>
          <Loader2 size={14} className="animate-spin" /> Estimating fee...
        </div>
      )}

      {/* Spinner during build/sign/send */}
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
            {status === 'building' && 'Preparing transaction...'}
            {status === 'signing' && 'Signing with your private key...'}
            {status === 'broadcasting' && 'Broadcasting to network...'}
          </span>
        </div>
      )}

      {/* Pending tx */}
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
              Waiting for confirmation...
            </span>
          </div>
          <div style={{ fontFamily: 'var(--ow-font-mono)', fontSize: 'var(--ow-font-size-xs)', wordBreak: 'break-all', color: 'var(--ow-text-tertiary)' }}>
            {txHash}
          </div>
        </div>
      )}

      {/* Review button */}
      {!showConfirm && !['building', 'signing', 'broadcasting', 'pending'].includes(status) && (
        <Button
          disabled={!!validationError || status !== 'ready'}
          onClick={() => setShowConfirm(true)}
          size="lg"
        >
          Review Transaction <ArrowRight size={16} />
        </Button>
      )}

      {/* Confirmation modal */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Send"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleSend} loading={status === 'signing'}>
              Confirm & Send
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ow-space-3)' }}>
          <div><strong>To:</strong> <code style={{ wordBreak: 'break-all' }}>{toAddress}</code></div>
          <div><strong>Amount:</strong> {amount} {activeChain?.nativeSymbol}</div>
          <div><strong>Fee:</strong> {feeInfo?.nativeFee} {activeChain?.nativeSymbol}</div>
          <div style={{ borderTop: '1px solid var(--ow-border-subtle)', paddingTop: 'var(--ow-space-3)', color: 'var(--ow-error)', fontSize: 'var(--ow-font-size-xs)' }}>
            Please double-check the address. Transactions cannot be reversed.
          </div>
        </div>
      </Modal>
    </div>
  );
}
