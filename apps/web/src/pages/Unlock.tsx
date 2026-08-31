/**
 * Unlock page — password input to decrypt the vault.
 *
 * This page is shown when:
 *   - vaultExists === true (wallet is initialized)
 *   - unlocked === false (session not yet open)
 *
 * The user enters their password → unlock() → derive accounts →
 * automatically redirects to Home.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button, Input } from '@open-wallet/ui';
import { useWalletStore } from '../store/wallet.js';
import { CHAIN_CONFIGS } from '@open-wallet/chains';

export function Unlock() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const unlock = useWalletStore(s => s.unlock);
  const clearVault = useWalletStore(s => s.clearVault);

  const handleUnlock = async () => {
    setError('');
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setLoading(true);
    try {
      // Derive accounts for ALL registered chains on unlock
      await unlock(password, CHAIN_CONFIGS);
      // Navigate — router re-renders from store.unlocked
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Invalid password')) {
        setError('Incorrect password. Please try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      // Clear password from DOM input regardless — best-effort
      setPassword('');
    }
  };

  const handleReset = async () => {
    if (confirm('Reset wallet? This will erase all data. Make sure you have your recovery phrase.')) {
      clearVault();
    }
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: 420,
    margin: '0 auto',
    padding: 'var(--ow-space-8)',
    backgroundColor: 'var(--ow-bg-secondary)',
    borderRadius: 'var(--ow-radius-xl)',
    border: '1px solid var(--ow-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-5)',
    marginTop: '15vh',
  };

  return (
    <div style={cardStyle}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--ow-space-3)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          backgroundColor: 'var(--ow-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ow-accent-fg)',
        }}>
          <KeyRound size={28} />
        </div>
        <div style={{ fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>
          Unlock Your Wallet
        </div>
        <div style={{
          fontSize: 'var(--ow-font-size-sm)',
          color: 'var(--ow-text-secondary)',
          textAlign: 'center',
        }}>
          Enter your password to unlock. Your keys never leave this device.
        </div>
      </div>

      <Input
        label="Password"
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter your password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleUnlock();
        }}
        error={error}
      />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--ow-space-2)',
        fontSize: 'var(--ow-font-size-xs)',
        color: 'var(--ow-text-tertiary)',
        cursor: 'pointer',
      }} onClick={() => setShowPassword(s => !s)}>
        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
        {showPassword ? 'Hide password' : 'Show password'}
      </div>

      <Button
        onClick={handleUnlock}
        loading={loading}
        disabled={!password || loading}
        size="lg"
      >
        {loading ? 'Unlocking...' : 'Unlock'}
      </Button>

      <div style={{
        borderTop: '1px solid var(--ow-border-subtle)',
        paddingTop: 'var(--ow-space-3)',
        textAlign: 'center',
      }}>
        <button
          onClick={handleReset}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ow-text-tertiary)',
            fontSize: 'var(--ow-font-size-xs)',
            cursor: 'pointer',
          }}
        >
          Forgot password? Reset wallet
        </button>
      </div>
    </div>
  );
}
