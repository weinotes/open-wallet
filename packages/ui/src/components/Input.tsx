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
