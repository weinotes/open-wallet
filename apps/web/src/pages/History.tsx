/**
 * Transaction history — queries block explorer API.
 * Phase 1: empty state with placeholder. Real explorer integration coming next.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@open-wallet/ui';

export function History() {
  const navigate = useNavigate();

  const cardStyle: React.CSSProperties = {
    maxWidth: 720,
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
        <div style={{ fontSize: 'var(--ow-font-size-xl)', fontWeight: 700 }}>Transaction History</div>
      </div>

      <div style={{
        backgroundColor: 'var(--ow-bg-secondary)',
        borderRadius: 'var(--ow-radius-xl)',
        border: '1px solid var(--ow-border)',
        padding: 'var(--ow-space-12)',
        textAlign: 'center',
        color: 'var(--ow-text-secondary)',
      }}>
        <div style={{ fontSize: 'var(--ow-font-size-lg)', fontWeight: 600, marginBottom: 'var(--ow-space-2)' }}>
          Transaction history coming soon
        </div>
        <div style={{ fontSize: 'var(--ow-font-size-sm)' }}>
          Block explorer API integration is in the next iteration.
        </div>
      </div>
    </div>
  );
}
