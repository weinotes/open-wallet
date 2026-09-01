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
/**
 * EVM-specific utilities: address formatting, validation.
 */

import { keccak_256 } from '@noble/hashes/sha3';

/**
 * Convert a lowercase hex address to EIP-55 mixed-case checksum format.
 * Throws if input is invalid.
 */
export function toEip55Address(address: string): string {
  const clean = address.startsWith('0x') ? address.slice(2) : address;

  if (clean.length !== 40) {
    throw new Error(`Invalid EVM address length: ${clean.length}`);
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('Invalid EVM address: non-hex characters');
  }

  const lower = clean.toLowerCase();
  const hash = keccak_256(lower);
  let hashHex = '';
  for (let i = 0; i < hash.length; i++) {
    hashHex += hash[i].toString(16).padStart(2, '0');
  }

  let result = '';
  for (let i = 0; i < 40; i++) {
    const char = lower[i];
    if (char >= 'a' && char <= 'f') {
      result += parseInt(hashHex[i], 16) >= 8 ? char.toUpperCase() : char;
    } else {
      result += char;
    }
  }
  return '0x' + result;
}

/** Validate an EVM address — accepts checksummed, lowercase, or uppercase */
export function validateEip55Address(address: string): boolean {
  if (!address) return false;
  if (!address.startsWith('0x') || address.length !== 42) return false;

  const body = address.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(body)) return false;

  // If fully lowercase or fully uppercase, accept (no checksum to verify)
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;

  // Mixed case: verify EIP-55 checksum
  try {
    const expected = toEip55Address(address);
    return address === expected;
  } catch {
    return false;
  }
}
