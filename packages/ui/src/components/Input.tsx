import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, style, id, ...rest }: InputProps) {
  const inputId = id || rest.name;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ow-space-1)' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 'var(--ow-font-size-sm)',
            fontWeight: 500,
            color: 'var(--ow-text-secondary)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          backgroundColor: 'var(--ow-bg-secondary)',
          color: 'var(--ow-text-primary)',
          border: `1px solid ${error ? 'var(--ow-error)' : 'var(--ow-border)'}`,
          borderRadius: 'var(--ow-radius-md)',
          padding: 'var(--ow-space-2) var(--ow-space-3)',
          fontSize: 'var(--ow-font-size-base)',
          fontFamily: 'var(--ow-font-sans)',
          outline: 'none',
          transition: 'border-color 0.15s ease',
          ...style,
        }}
        {...rest}
      />
      {error && (
        <span style={{ fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-error)' }}>
          {error}
        </span>
      )}
      {!error && hint && (
        <span style={{ fontSize: 'var(--ow-font-size-xs)', color: 'var(--ow-text-tertiary)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}
