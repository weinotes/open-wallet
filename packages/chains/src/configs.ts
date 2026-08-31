/**
 * Chain configurations for all supported networks.
 * Each config includes RPC failover list, explorer URL, and BIP44 path.
 */

import type { ChainConfig } from '@open-wallet/shared';

/** All built-in chain configurations */
export const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: 'eth-1',
    name: 'Ethereum',
    type: 'evm',
    chainIdDecimal: 1,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    rpcs: [
      'https://rpc.ankr.com/eth',
      'https://ethereum.publicnode.com',
      'https://cloudflare-eth.com',
    ],
    explorer: 'https://etherscan.io',
    bip44Path: "m/44'/60'/0'/0",
    icon: 'ethereum',
  },
  {
    chainId: 'bsc-56',
    name: 'BNB Chain',
    type: 'evm',
    chainIdDecimal: 56,
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    rpcs: [
      'https://bsc-dataseed.binance.org',
      'https://rpc.ankr.com/bsc',
      'https://bsc.publicnode.com',
    ],
    explorer: 'https://bscscan.com',
    bip44Path: "m/44'/714'/0'/0",
    icon: 'binance',
  },
  {
    chainId: 'bsc-97',
    name: 'BSC Testnet',
    type: 'evm',
    chainIdDecimal: 97,
    nativeSymbol: 'tBNB',
    nativeDecimals: 18,
    rpcs: [
      'https://data-seed-prebsc-2-s1.binance.org:8545',
      'https://data-seed-prebsc-1-s2.binance.org:8545',
      'https://data-seed-prebsc-2-s2.binance.org:8545',
      'https://bsc-testnet.publicnode.com',
    ],
    explorer: 'https://testnet.bscscan.com',
    bip44Path: "m/44'/714'/0'/0",
    icon: 'binance',
    testnet: true,
  },
  {
    chainId: 'polygon-137',
    name: 'Polygon',
    type: 'evm',
    chainIdDecimal: 137,
    nativeSymbol: 'MATIC',
    nativeDecimals: 18,
    rpcs: [
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon.publicnode.com',
    ],
    explorer: 'https://polygonscan.com',
    bip44Path: "m/44'/966'/0'/0",
    icon: 'polygon',
  },
  {
    chainId: 'arbitrum-42161',
    name: 'Arbitrum One',
    type: 'evm',
    chainIdDecimal: 42161,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    rpcs: [
      'https://arb1.arbitrum.io/rpc',
      'https://rpc.ankr.com/arbitrum',
    ],
    explorer: 'https://arbiscan.io',
    bip44Path: "m/44'/60'/0'/0",
    icon: 'arbitrum',
  },
  {
    chainId: 'optimism-10',
    name: 'Optimism',
    type: 'evm',
    chainIdDecimal: 10,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    rpcs: [
      'https://mainnet.optimism.io',
      'https://rpc.ankr.com/optimism',
    ],
    explorer: 'https://optimistic.etherscan.io',
    bip44Path: "m/44'/60'/0'/0",
    icon: 'optimism',
  },
  {
    chainId: 'base-8453',
    name: 'Base',
    type: 'evm',
    chainIdDecimal: 8453,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    rpcs: [
      'https://mainnet.base.org',
      'https://rpc.ankr.com/base',
    ],
    explorer: 'https://basescan.org',
    bip44Path: "m/44'/60'/0'/0",
    icon: 'base',
  },
  {
    chainId: 'avalanche-43114',
    name: 'Avalanche C-Chain',
    type: 'evm',
    chainIdDecimal: 43114,
    nativeSymbol: 'AVAX',
    nativeDecimals: 18,
    rpcs: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://rpc.ankr.com/avalanche',
    ],
    explorer: 'https://snowtrace.io',
    bip44Path: "m/44'/9000'/0'/0",
    icon: 'avalanche',
  },
  {
    chainId: 'solana',
    name: 'Solana',
    type: 'solana',
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    rpcs: [
      'https://api.mainnet-beta.solana.com',
      'https://api.devnet.solana.com',
      'https://solana-rpc.publicnode.com',
    ],
    explorer: 'https://explorer.solana.com',
    bip44Path: "m/44'/501'/0'/0",
    icon: 'solana',
  },
];

/** Lookup config by chainId */
export function getChainConfig(chainId: string): ChainConfig | undefined {
  return CHAIN_CONFIGS.find(c => c.chainId === chainId);
}

/** Get all EVM chain configs */
export function getEvmConfigs(): ChainConfig[] {
  return CHAIN_CONFIGS.filter(c => c.type === 'evm');
}

/** Get all Solana chain configs */
export function getSolanaConfigs(): ChainConfig[] {
  return CHAIN_CONFIGS.filter(c => c.type === 'solana');
}
