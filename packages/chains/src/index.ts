export * from './configs.js';
export * from './evm/adapter.js';
export * from './solana/adapter.js';

import { chainRegistry } from '@open-wallet/core';
import { EvmAdapter } from './evm/adapter.js';
import { SolanaAdapter } from './solana/adapter.js';
import { CHAIN_CONFIGS } from './configs.js';

/** Register all built-in chain adapters into the global registry */
export function registerAllChains(): void {
  for (const config of CHAIN_CONFIGS) {
    if (config.type === 'evm') {
      chainRegistry.register(new EvmAdapter(config));
    } else if (config.type === 'solana') {
      chainRegistry.register(new SolanaAdapter(config));
    }
  }
}
