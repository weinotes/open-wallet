/**
 * Receive page — display current chain + account address with QR code.
 * Phase 1: text address + copy button. QR code (qrcode.react) coming Phase 2.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@open-wallet/ui';
import { useWalletStore } from '../store/wallet.js';
import { AddressDisplay } from '@open-wallet/ui';

export function Receive() {
  const navigate = useNavigate();
  const activeChainId = useWalletStore(s => s.activeChainId);
  const accounts = useWalletStore(s => s.accounts);
  const account = accounts.find(a => a.chainId === activeChainId) ?? accounts[0];

  const cardStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: '0 auto',
    padding: 'var(--ow-space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-4)',
    marginTop: '5vh',
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-3)' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <div style={{ fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>Receive</div>
      </div>

      <div style={{
        backgroundColor: 'var(--ow-bg-secondary)',
        borderRadius: 'var(--ow-radius-xl)',
        border: '1px solid var(--ow-border)',
        padding: 'var(--ow-space-6)',
        textAlign: 'center',
      }}>
        {account ? (
          <>
            <div style={{ color: 'var(--ow-text-secondary)', fontSize: 'var(--ow-font-size-sm)', marginBottom: 'var(--ow-space-3)' }}>
              Send assets to this address
            </div>
            <div style={{
              backgroundColor: 'var(--ow-bg-tertiary)',
              padding: 'var(--ow-space-4)',
              borderRadius: 'var(--ow-radius-md)',
              fontFamily: 'var(--ow-font-mono)',
              fontSize: 'var(--ow-font-size-sm)',
              wordBreak: 'break-all',
              border: '1px solid var(--ow-border-subtle)',
              marginBottom: 'var(--ow-space-4)',
            }}>
              {account.address}
            </div>
            <AddressDisplay address={account.address} showCopy full />
          </>
        ) : (
          <div style={{ color: 'var(--ow-text-secondary)' }}>
            No account for this chain yet
          </div>
        )}
      </div>

      <div style={{ fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-warning)', textAlign: 'center' }}>
        ⚠ Only send assets on the matching chain
      </div>
    </div>
  );
}
