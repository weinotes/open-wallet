import * as React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    background-color: var(--ow-accent);
    color: var(--ow-accent-fg);
    border: none;
  `,
  secondary: `
    background-color: var(--ow-bg-tertiary);
    color: var(--ow-text-primary);
    border: 1px solid var(--ow-border);
  `,
  ghost: `
    background-color: transparent;
    color: var(--ow-text-primary);
    border: none;
  `,
  danger: `
    background-color: var(--ow-error);
    color: #ffffff;
    border: none;
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'padding: var(--ow-space-1) var(--ow-space-3); font-size: var(--ow-font-size-sm);',
  md: 'padding: var(--ow-space-2) var(--ow-space-4); font-size: var(--ow-font-size-base);',
  lg: 'padding: var(--ow-space-3) var(--ow-space-6); font-size: var(--ow-font-size-lg);',
};

const baseStyles = `
  border-radius: var(--ow-radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ow-space-2);
  font-family: var(--ow-font-sans);
`;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        ...style,
        ...(baseStyles as React.CSSProperties),
        ...(variantStyles[variant] as React.CSSProperties),
        ...(sizeStyles[size] as React.CSSProperties),
        opacity: disabled || loading ? 0.6 : 1,
      }}
      {...rest}
    >
      {loading && <span>Loading...</span>}
      {!loading && children}
    </button>
  );
}
