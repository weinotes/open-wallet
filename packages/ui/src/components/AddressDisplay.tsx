import * as React from 'react';
import { shortenAddress } from '@open-wallet/shared';

export interface AddressDisplayProps {
  address: string;
  chainIcon?: string;
  showCopy?: boolean;
  full?: boolean;
}

export function AddressDisplay({ address, showCopy = true, full = false }: AddressDisplayProps) {
  const [copied, setCopied] = React.useState(false);
  const display = full ? address : shortenAddress(address);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--ow-space-2)',
        fontFamily: 'var(--ow-font-mono)',
        fontSize: 'var(--ow-font-size-sm)',
        color: 'var(--ow-text-primary)',
        backgroundColor: 'var(--ow-bg-tertiary)',
        padding: 'var(--ow-space-1) var(--ow-space-3)',
        borderRadius: 'var(--ow-radius-md)',
        border: '1px solid var(--ow-border-subtle)',
      }}
    >
      <span>{display}</span>
      {showCopy && (
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ow-text-tertiary)',
            fontSize: 'var(--ow-font-size-xs)',
          }}
        >
          {copied ? '✓' : '📋'}
        </button>
      )}
    </div>
  );
}
