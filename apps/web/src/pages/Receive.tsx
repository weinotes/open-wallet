/**
 * Receive page — display current chain + account address with QR code.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@open-wallet/ui';
import { useWalletStore } from '../store/wallet.js';
import { QRCodeSVG } from 'qrcode.react';

export function Receive() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeChainId = useWalletStore(s => s.activeChainId);
  const accounts = useWalletStore(s => s.accounts);
  const account = accounts.find(a => a.chainId === activeChainId) ?? accounts[0];
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — no-op
    }
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

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-3)' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <div style={{ fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>{t('receive.title')}</div>
      </div>

      <div style={{
        backgroundColor: 'var(--ow-bg-secondary)',
        borderRadius: 'var(--ow-radius-xl)',
        border: '1px solid var(--ow-border)',
        padding: 'var(--ow-space-6)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--ow-space-4)',
      }}>
        {account ? (
          <>
            <div style={{ color: 'var(--ow-text-secondary)', fontSize: 'var(--ow-font-size-sm)' }}>
              {t('receive.desc')}
            </div>

            {/* QR code */}
            <div style={{
              backgroundColor: 'var(--ow-bg-tertiary)',
              padding: 'var(--ow-space-4)',
              borderRadius: 'var(--ow-radius-md)',
              border: '1px solid var(--ow-border-subtle)',
            }}>
              <QRCodeSVG
                value={account.address}
                size={200}
                level="M"
                includeMargin={false}
                fgColor="currentColor"
              />
            </div>

            {/* Address + copy */}
            <div style={{
              fontFamily: 'var(--ow-font-mono)',
              fontSize: 'var(--ow-font-size-sm)',
              wordBreak: 'break-all',
              backgroundColor: 'var(--ow-bg-tertiary)',
              padding: 'var(--ow-space-3)',
              borderRadius: 'var(--ow-radius-md)',
              border: '1px solid var(--ow-border-subtle)',
              width: '100%',
            }}>
              {account.address}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              style={{ display: 'flex', gap: 'var(--ow-space-2)', alignItems: 'center' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t('receive.copied') : t('receive.copyAddress')}
            </Button>
          </>
        ) : (
          <div style={{ color: 'var(--ow-text-secondary)' }}>
            {t('receive.noAccount')}
          </div>
        )}
      </div>

      <div style={{ fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-warning)', textAlign: 'center' }}>
        {t('receive.warning')}
      </div>
    </div>
  );
}
