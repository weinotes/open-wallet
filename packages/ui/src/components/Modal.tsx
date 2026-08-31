import * as React from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 'var(--ow-space-4)',
};

const contentStyle: React.CSSProperties = {
  backgroundColor: 'var(--ow-bg-secondary)',
  borderRadius: 'var(--ow-radius-lg)',
  border: '1px solid var(--ow-border)',
  boxShadow: 'var(--ow-shadow-lg)',
  maxWidth: 480,
  width: '100%',
  maxHeight: '80vh',
  overflow: 'auto',
};

const headerStyle: React.CSSProperties = {
  padding: 'var(--ow-space-4) var(--ow-space-6)',
  borderBottom: '1px solid var(--ow-border-subtle)',
  fontSize: 'var(--ow-font-size-lg)',
  fontWeight: 600,
};

const bodyStyle: React.CSSProperties = {
  padding: 'var(--ow-space-6)',
};

const footerStyle: React.CSSProperties = {
  padding: 'var(--ow-space-4) var(--ow-space-6)',
  borderTop: '1px solid var(--ow-border-subtle)',
  display: 'flex',
  gap: 'var(--ow-space-2)',
  justifyContent: 'flex-end',
};

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={contentStyle} onClick={e => e.stopPropagation()}>
        {title && <div style={headerStyle}>{title}</div>}
        <div style={bodyStyle}>{children}</div>
        {footer && <div style={footerStyle}>{footer}</div>}
      </div>
    </div>
  );
}
