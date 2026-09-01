/**
 * Copyright 2026 Davey Wong <wgwcko@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--ow-accent)',
    color: 'var(--ow-accent-fg)',
    border: 'none',
  },
  secondary: {
    backgroundColor: 'var(--ow-bg-tertiary)',
    color: 'var(--ow-text-primary)',
    border: '1px solid var(--ow-border)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--ow-text-primary)',
    border: 'none',
  },
  danger: {
    backgroundColor: 'var(--ow-error)',
    color: '#ffffff',
    border: 'none',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: 'var(--ow-space-1) var(--ow-space-3)', fontSize: 'var(--ow-font-size-sm)' },
  md: { padding: 'var(--ow-space-2) var(--ow-space-4)', fontSize: 'var(--ow-font-size-base)' },
  lg: { padding: 'var(--ow-space-3) var(--ow-space-6)', fontSize: 'var(--ow-font-size-lg)' },
};

const baseStyles: React.CSSProperties = {
  borderRadius: 'var(--ow-radius-md)',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--ow-space-2)',
  fontFamily: 'var(--ow-font-sans)',
};

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
        ...baseStyles,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
        opacity: disabled || loading ? 0.6 : 1,
      }}
      {...rest}
    >
      {loading && <span>Loading...</span>}
      {!loading && children}
    </button>
  );
}
