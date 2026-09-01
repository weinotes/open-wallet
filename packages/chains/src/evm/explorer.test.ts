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
 * Explorer client tests — URL mapping, direction parsing, token decimals.
 *
 * The URL-mapping tests are a REGRESSION GATE for the "optimistic.etherscan
 * before etherscan" ordering bug: before the fix, Optimism history silently
 * queried api.etherscan.io (Ethereum mainnet data) because the generic
 * 'etherscan' rule matched first.
 */
import { describe, it, expect } from 'vitest';
import { resolveExplorerApi } from './explorer.js';
import { toTransactionRecord, resolveStatus } from './adapter.js';

const MY_ADDR = '0x461c9A881812BbC66355FA13594442651552f772';

describe('resolveExplorerApi — URL → API base mapping', () => {
  it('maps optimistic.etherscan to the Optimism API (NOT generic etherscan)', () => {
    // Regression: 'optimistic.etherscan.io' contains 'etherscan' — the
    // specific rule must win, otherwise Optimism data comes from mainnet.
    const r = resolveExplorerApi('https://optimistic.etherscan.io');
    expect(r.apiBase).toBe('https://api-optimistic.etherscan.io');
    expect(r.label).toBe('Optimistic');
  });

  it('maps plain etherscan to the Ethereum API', () => {
    expect(resolveExplorerApi('https://etherscan.io').apiBase).toBe('https://api.etherscan.io');
  });

  it('maps bscscan mainnet + testnet separately', () => {
    expect(resolveExplorerApi('https://bscscan.com').apiBase).toBe('https://api.bscscan.com');
    expect(resolveExplorerApi('https://testnet.bscscan.com').apiBase).toBe('https://api-testnet.bscscan.com');
  });

  it('maps polygonscan, arbiscan, basescan, snowtrace', () => {
    expect(resolveExplorerApi('https://polygonscan.com').apiBase).toBe('https://api.polygonscan.com');
    expect(resolveExplorerApi('https://arbiscan.io').apiBase).toBe('https://api.arbiscan.io');
    expect(resolveExplorerApi('https://basescan.org').apiBase).toBe('https://api.basescan.org');
    expect(resolveExplorerApi('https://snowtrace.io').apiBase).toBe('https://api.snowtrace.io');
  });

  it('falls back to deriving /api for unknown explorers', () => {
    const r = resolveExplorerApi('https://example-explorer.com');
    expect(r.apiBase).toBe('https://example-explorer.com/api');
    expect(r.label).toBe('Explorer');
  });
});

describe('toTransactionRecord — direction + decimals + status', () => {
  const base = {
    blockNumber: '1000',
    timeStamp: '1700000000',
    hash: '0xabc',
    nonce: '1',
    blockHash: '0xblock',
    transactionIndex: '0',
    from: '0x461c9A881812BbC66355FA13594442651552f772',
    to: '0x1111111111111111111111111111111111111111',
    value: '1000000000000000000',
    gas: '21000',
    gasPrice: '1000000000',
    isError: '0' as '0' | '1',
    input: '0x',
    confirmations: '10',
  };

  it('classifies own-outgoing tx as sent', () => {
    const tx = { ...base, txreceipt_status: '1' as const, from: MY_ADDR, to: '0x1111111111111111111111111111111111111111' };
    const r = toTransactionRecord(tx, MY_ADDR);
    expect(r.direction).toBe('sent');
    expect(r.status).toBe('confirmed');
    expect(r.fee).toBe('21000000000000');
  });

  it('classifies incoming tx (to = own address) as received', () => {
    const tx = { ...base, from: '0x1111111111111111111111111111111111111111', to: MY_ADDR };
    const r = toTransactionRecord(tx, MY_ADDR);
    expect(r.direction).toBe('received');
  });

  it('propagates ERC20 token decimals (USDT = 6, not 18)', () => {
    const tx = {
      ...base,
      from: '0x1111111111111111111111111111111111111111',
      to: MY_ADDR,
      tokenSymbol: 'USDT',
      tokenDecimal: '6',
      contractAddress: '0x55d398326f99059fF775485246999027B3197955',
    };
    const r = toTransactionRecord(tx, MY_ADDR);
    expect(r.tokenSymbol).toBe('USDT');
    expect(r.tokenDecimals).toBe(6);
    expect(r.tokenAddress).toBe('0x55d398326f99059fF775485246999027B3197955');
  });

  it('defaults missing token decimals to undefined (caller falls back)', () => {
    const tx = {
      ...base,
      from: '0x1111111111111111111111111111111111111111',
      to: MY_ADDR,
      tokenSymbol: 'ABC',
      contractAddress: '0x0000000000000000000000000000000000000001',
    };
    const r = toTransactionRecord(tx, MY_ADDR);
    expect(r.tokenDecimals).toBeUndefined();
    expect(r.tokenSymbol).toBe('ABC');
  });

  it('resolves status: confirmed / failed / pending', () => {
    expect(resolveStatus({ ...base, txreceipt_status: '1' })).toBe('confirmed');
    expect(resolveStatus({ ...base, isError: '1' })).toBe('failed');
    expect(resolveStatus({ ...base, txreceipt_status: '0' })).toBe('failed');
    expect(resolveStatus({ ...base, txreceipt_status: undefined })).toBe('pending');
    expect(resolveStatus({ ...base, txreceipt_status: '' })).toBe('pending');
  });
});
