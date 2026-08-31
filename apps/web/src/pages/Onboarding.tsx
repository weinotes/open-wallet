/**
 * Onboarding page — Create new wallet OR import existing wallet.
 *
 * Flow:
 *   Step 1: Create / Import choice
 *   Step 2: Generate or input mnemonic
 *   Step 3: (Create flow) Show mnemonic, ask user to verify
 *   Step 4: Set password → encrypt vault → auto-unlock → derive accounts
 *   Step 5: Done → route to Home (store.unlocked becomes true)
 */

import { useState } from 'react';
import { createMnemonic, isValidMnemonic, evaluatePassword, encryptVault } from '@open-wallet/core';
import { Button, Input } from '@open-wallet/ui';
import { useWalletStore } from '../store/wallet.js';
import { CHAIN_CONFIGS } from '@open-wallet/chains';

type Step = 'choice' | 'create' | 'verify' | 'import' | 'password';

export function Onboarding() {
  const [step, setStep] = useState<Step>('choice');
  const [mode, setMode] = useState<'create' | 'import'>('create');
  const [mnemonic, setMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setVault = useWalletStore(s => s.setVault);
  const unlock = useWalletStore(s => s.unlock);

  const go = (next: Step) => { setError(''); setStep(next); };

  const handleCreateNew = () => {
    setMode('create');
    setMnemonic(createMnemonic());
    go('create');
  };

  const handleImport = () => {
    setMode('import');
    go('import');
  };

  const handleImportNext = () => {
    if (!isValidMnemonic(importMnemonic)) {
      setError('Invalid mnemonic phrase. Please check all words.');
      return;
    }
    setMnemonic(importMnemonic.trim());
    go('password');
  };

  const handleVerifyNext = () => go('password');

  /**
   * Final step: encrypt vault → persist → auto-unlock.
   * After this, store.unlocked === true → router renders Home.
   */
  const handlePasswordNext = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const evalResult = evaluatePassword(password);
    if (evalResult.score < 2) {
      setError(evalResult.errors[0] ?? 'Password too weak');
      return;
    }

    setLoading(true);
    try {
      const vault = await encryptVault(mnemonic, password);
      setVault(vault);
      // Auto-unlock immediately → derive accounts across all chains
      // Router will switch from Onboarding to Home after store.unlocked becomes true
      await unlock(password, CHAIN_CONFIGS);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ──────────── Render helpers ────────────

  const cardStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: '0 auto',
    padding: 'var(--ow-space-8)',
    backgroundColor: 'var(--ow-bg-secondary)',
    borderRadius: 'var(--ow-radius-xl)',
    border: '1px solid var(--ow-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-5)',
    marginTop: '10vh',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 'var(--ow-font-size-2xl)',
    fontWeight: 700,
    textAlign: 'center',
  };

  // ──────────── Step 1: Choice ────────────
  if (step === 'choice') {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>OpenWallet</div>
        <div style={{ textAlign: 'center', color: 'var(--ow-text-secondary)' }}>
          Your keys, your coins. Self-custodial multi-chain wallet.
        </div>
        <Button size="lg" onClick={handleCreateNew}>Create New Wallet</Button>
        <Button variant="secondary" size="lg" onClick={handleImport}>Import Existing Wallet</Button>
        <div style={{ textAlign: 'center', fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)' }}>
          Apache-2.0 Licensed · No servers · No tracking
        </div>
      </div>
    );
  }

  // ──────────── Step 2: Show generated mnemonic ────────────
  if (step === 'create') {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Your Recovery Phrase</div>
        <div style={{ color: 'var(--ow-text-secondary)', fontSize: 'var(--ow-font-size-sm)', textAlign: 'center' }}>
          Write these 24 words in order. Store them safely. This is the ONLY way to recover your wallet.
        </div>
        <div style={{
          backgroundColor: 'var(--ow-bg-tertiary)',
          padding: 'var(--ow-space-4)',
          borderRadius: 'var(--ow-radius-md)',
          fontFamily: 'var(--ow-font-mono)',
          fontSize: 'var(--ow-font-size-sm)',
          border: '1px solid var(--ow-border)',
        }}>
          {mnemonic}
        </div>
        <div style={{ color: 'var(--ow-error)', fontSize: 'var(--ow-font-size-xs)', textAlign: 'center' }}>
          ⚠ Never share this phrase with anyone
        </div>
        <Button onClick={handleVerifyNext}>I've saved it, continue</Button>
      </div>
    );
  }

  // ──────────── Step 3: Verify (placeholder) ────────────
  if (step === 'verify') {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Verify Recovery Phrase</div>
        <div style={{ color: 'var(--ow-text-secondary)', textAlign: 'center' }}>
          Coming in next iteration — you'll be asked to select a few words in order.
        </div>
        <Button onClick={handleVerifyNext}>Continue</Button>
      </div>
    );
  }

  // ──────────── Step 4: Import ────────────
  if (step === 'import') {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Import Recovery Phrase</div>
        <Input
          label="Enter your 12 or 24 word phrase"
          placeholder="word1 word2 word3 ..."
          value={importMnemonic}
          onChange={e => setImportMnemonic(e.target.value)}
          error={error}
        />
        <Button onClick={handleImportNext} disabled={!importMnemonic.trim()}>Next</Button>
        <Button variant="ghost" onClick={() => go('choice')}>← Back</Button>
      </div>
    );
  }

  // ──────────── Step 5: Set password ────────────
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Set Password</div>
      <div style={{ color: 'var(--ow-text-secondary)', fontSize: 'var(--ow-font-size-sm)', textAlign: 'center' }}>
        This password encrypts your wallet locally. We cannot help you recover it.
      </div>
      <Input
        label="Password"
        type="password"
        placeholder="Min 8 chars, uppercase + number"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <Input
        label="Confirm Password"
        type="password"
        placeholder="Re-enter password"
        value={confirmPassword}
        onChange={e => setConfirmPassword(e.target.value)}
        error={error}
      />
      <Button onClick={handlePasswordNext} variant="primary" loading={loading}>
        {mode === 'create' ? 'Create Wallet' : 'Import Wallet'}
      </Button>
      <Button variant="ghost" onClick={() => go(mode === 'create' ? 'create' : 'import')}>← Back</Button>
    </div>
  );
}
