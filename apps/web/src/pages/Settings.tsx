/**
 * Settings — Theme, language, about, reset wallet.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button, Modal } from '@open-wallet/ui';
import { useState } from 'react';
import { useWalletStore } from '../store/wallet.js';

export function Settings() {
  const navigate = useNavigate();
  const theme = useWalletStore(s => s.theme);
  const language = useWalletStore(s => s.language);
  const setTheme = useWalletStore(s => s.setTheme);
  const setLanguage = useWalletStore(s => s.setLanguage);
  const clearVault = useWalletStore(s => s.clearVault);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const cardStyle: React.CSSProperties = {
    maxWidth: 560,
    margin: '0 auto',
    padding: 'var(--ow-space-6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--ow-space-5)',
    marginTop: '5vh',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--ow-space-4)',
    backgroundColor: 'var(--ow-bg-secondary)',
    border: '1px solid var(--ow-border)',
    borderRadius: 'var(--ow-radius-md)',
  };

  const handleReset = () => {
    clearVault();
    navigate('/', { replace: true });
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ow-space-3)' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <div style={{ fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>Settings</div>
      </div>

      <div style={rowStyle}>
        <span>Theme</span>
        <div style={{ display: 'flex', gap: 'var(--ow-space-2)' }}>
          <Button size="sm" variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}>Dark</Button>
          <Button size="sm" variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}>Light</Button>
        </div>
      </div>

      <div style={rowStyle}>
        <span>Language</span>
        <div style={{ display: 'flex', gap: 'var(--ow-space-2)' }}>
          <Button size="sm" variant={language === 'en' ? 'primary' : 'secondary'} onClick={() => setLanguage('en')}>English</Button>
          <Button size="sm" variant={language === 'zh' ? 'primary' : 'secondary'} onClick={() => setLanguage('zh')}>中文</Button>
        </div>
      </div>

      <div style={rowStyle}>
        <span>About</span>
        <span style={{ color: 'var(--ow-text-tertiary)', fontSize: 'var(--ow-font-size-sm)' }}>v0.1.0 · Apache-2.0</span>
      </div>

      <div style={{ borderTop: '1px solid var(--ow-border)', paddingTop: 'var(--ow-space-4)' }}>
        <Button variant="danger" onClick={() => setShowResetConfirm(true)} style={{ width: '100%' }}>
          <Trash2 size={16} /> Reset Wallet
        </Button>
        <div style={{ fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-error)', textAlign: 'center', marginTop: 'var(--ow-space-2)' }}>
          This erases all data. Ensure you have your recovery phrase backed up.
        </div>
      </div>

      <Modal
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Reset Wallet?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleReset}>Yes, Reset Everything</Button>
          </>
        }
      >
        <div style={{ color: 'var(--ow-text-secondary)' }}>
          This will delete your encrypted vault from this device. You'll need your recovery phrase to restore.
        </div>
      </Modal>
    </div>
  );
}
