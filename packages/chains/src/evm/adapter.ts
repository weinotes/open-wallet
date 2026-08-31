/**
 * EVM-compatible chain adapter (Ethereum, BSC, Polygon, Arbitrum, etc.)
 *
 * Uses viem for all chain interactions. Supports:
 *   - EIP-1559 dynamic gas (maxFeePerGas / maxPriorityFeePerGas) — auto-detected
 *   - Legacy gas pricing fallback (for chains like BSC that lack 1559)
 *   - Transaction building, signing, broadcasting
 *   - Fallback transport across multiple RPC nodes with auto-failover
 *
 * Security notes:
 *   - private keys are accepted as transient Uint8Array; caller owns wiping
 *   - walletClient is created per-sign with its own isolated transport
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain as ViemChain,
  parseUnits,
  getContract,
  erc20Abi,
} from 'viem';
import { privateKeyToAccount, publicKeyToAddress } from 'viem/accounts';
import {
  mainnet,
  bsc,
  bscTestnet,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
} from 'viem/chains';

import type {
  ChainConfig,
  FeeEstimate,
  RawTransaction,
  SignedTransaction,
  TokenBalance,
  TransactionRecord,
} from '@open-wallet/shared';
import type { ChainAdapter } from '@open-wallet/core';
import { toEip55Address, validateEip55Address } from './utils.js';

/** Map our chainId to viem chain object */
const VIEM_CHAIN_MAP: Record<string, ViemChain> = {
  'eth-1': mainnet,
  'bsc-56': bsc,
  'bsc-97': bscTestnet,
  'polygon-137': polygon,
  'arbitrum-42161': arbitrum,
  'optimism-10': optimism,
  'base-8453': base,
  'avalanche-43114': avalanche,
};

export class EvmAdapter implements ChainAdapter {
  readonly chainId: string;
  readonly chainName: string;
  readonly config: ChainConfig;
  readonly chainDecimalId: number;

  private publicClient: PublicClient;
  private chain: ViemChain;
  /** Cached EIP-1559 support detection — undefined = not yet probed */
  private supports1559: boolean | undefined;

  constructor(config: ChainConfig) {
    this.config = config;
    this.chainId = config.chainId;
    this.chainName = config.name;
    this.chainDecimalId = config.chainIdDecimal ?? 0;

    const viemChain = VIEM_CHAIN_MAP[config.chainId];
    if (viemChain) {
      this.chain = viemChain;
    } else {
      this.chain = {
        id: this.chainDecimalId,
        name: config.name,
        nativeCurrency: {
          name: config.nativeSymbol,
          symbol: config.nativeSymbol,
          decimals: config.nativeDecimals,
        },
        rpcUrls: {
          default: { http: config.rpcs },
          public: { http: config.rpcs },
        },
      } as ViemChain;
    }

    // Build a fallback transport over all configured RPCs.
    // Each individual http() has a 15s timeout + 2 retries; fallback()
    // adds automatic failover to the next node on failure.
    const transports = config.rpcs.map(url =>
      http(url, { timeout: 15_000, retryCount: 2, retryDelay: 300 }),
    );

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: fallback(transports, { rank: true }),
    });
  }

  /**
   * Probe whether this chain supports EIP-1559.
   * Caches the result — runs once per adapter instance.
   *
   * Detection strategy: call eth_maxPriorityFeePerGas. Chains without
   * 1559 support return an error or 0, but legacy BSC also sometimes
   * returns a non-zero value. So we ALSO try estimateFeesPerGas and
   * check if it produces a sensible maxFeePerGas distinct from gasPrice.
   */
  private async detectEip1559(): Promise<boolean> {
    if (this.supports1559 !== undefined) return this.supports1559;

    try {
      // Method 1: eth_maxPriorityFeePerGas exists on 1559 chains
      const maxPriority = await this.publicClient.request({
        method: 'eth_maxPriorityFeePerGas',
      } as never);
      if (maxPriority && BigInt(maxPriority as string) > 0n) {
        this.supports1559 = true;
        return true;
      }
    } catch {
      // Method not supported → legacy chain
    }

    // Method 2: estimateFeesPerGas returns maxFeePerGas/maxPriorityFeePerGas
    try {
      const feeData = await this.publicClient.estimateFeesPerGas();
      if (feeData.maxFeePerGas !== undefined && feeData.maxPriorityFeePerGas !== undefined) {
        this.supports1559 = true;
        return true;
      }
    } catch {
      // Not supported
    }

    this.supports1559 = false;
    return false;
  }

  // ─── Address ──────────────────────────────────────────────────────

  deriveAddress(publicKey: Uint8Array, _accountIndex: number): string {
    const raw = '0x04' + Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
    return toEip55Address(publicKeyToAddress(raw as Hex));
  }

  validateAddress(address: string): boolean {
    return validateEip55Address(address);
  }

  // ─── Balance ───────────────────────────────────────────────────────

  async getNativeBalance(address: string): Promise<string> {
    const bal = await this.publicClient.getBalance({ address: address as Address });
    return bal.toString();
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<string> {
    const contract = getContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      client: this.publicClient,
    });
    const bal = await contract.read.balanceOf([address as Address]);
    return (bal as bigint).toString();
  }

  async getAllTokenBalances(_address: string): Promise<TokenBalance[]> {
    return [];
  }

  // ─── Transactions ──────────────────────────────────────────────────

  async buildTransaction(params: RawTransaction): Promise<RawTransaction> {
    // Fill nonce from RPC
    const nonce = await this.publicClient.getTransactionCount({
      address: params.from as Address,
    });

    // Estimate gas for the actual operation (not hard-coded 21000)
    const gasEstimate = await this.publicClient.estimateGas({
      account: params.from as Address,
      to: params.to as Address,
      value: params.value ? BigInt(params.value) : undefined,
      data: params.data as Hex | undefined,
    });

    const supports1559 = await this.detectEip1559();
    const fees = await this.estimateFees(params, gasEstimate);

    const built: RawTransaction = {
      ...params,
      nonce,
      gasLimit: gasEstimate.toString(),
      chainId: this.config.chainId,
    };

    if (supports1559) {
      // EIP-1559 path
      built.maxFeePerGas = fees.gasPrice;
      const priorityFee = (BigInt(fees.gasPrice) / 10n).toString();
      built.maxPriorityFeePerGas = priorityFee;
    } else {
      // Legacy path — use gasPrice only
      built.gasPrice = fees.gasPrice;
    }

    return built;
  }

  async signTransaction(
    rawTx: RawTransaction,
    privateKey: Uint8Array,
  ): Promise<SignedTransaction> {
    const pkHex = '0x' + Array.from(privateKey)
      .map(b => b.toString(16).padStart(2, '0')).join('') as Hex;

    const account = privateKeyToAccount(pkHex);
    // Reuse the same fallback transport pattern as publicClient
    const transports = this.config.rpcs.map(url =>
      http(url, { timeout: 15_000, retryCount: 2, retryDelay: 300 }),
    );
    const walletClient = createWalletClient({
      account,
      chain: this.chain,
      transport: fallback(transports, { rank: true }),
    });

    const supports1559 = await this.detectEip1559();

    const signature = await walletClient.signTransaction({
      to: rawTx.to as Address,
      value: rawTx.value ? BigInt(rawTx.value) : undefined,
      data: rawTx.data as Hex | undefined,
      nonce: rawTx.nonce,
      gas: rawTx.gasLimit ? BigInt(rawTx.gasLimit) : undefined,
      chainId: this.chainDecimalId,
      // Only include 1559 fields if chain actually supports them
      ...(supports1559
        ? {
            maxFeePerGas: rawTx.maxFeePerGas ? BigInt(rawTx.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas
              ? BigInt(rawTx.maxPriorityFeePerGas)
              : undefined,
          }
        : {
            gasPrice: rawTx.gasPrice
              ? BigInt(rawTx.gasPrice)
              : rawTx.maxFeePerGas
                ? BigInt(rawTx.maxFeePerGas)
                : undefined,
          }),
    });

    return { raw: signature, signature };
  }

  async sendTransaction(signedTx: SignedTransaction): Promise<string> {
    return this.publicClient.sendRawTransaction({
      serializedTransaction: signedTx.signature as Hex,
    });
  }

  // ─── Explorer ──────────────────────────────────────────────────────

  async getTransactionHistory(_address: string): Promise<TransactionRecord[]> {
    return [];
  }

  async getTransactionStatus(txHash: string): Promise<TransactionRecord['status']> {
    const receipt = await this.publicClient.getTransactionReceipt({
      hash: txHash as Hex,
    });
    if (!receipt) return 'pending';
    return receipt.status === 'success' ? 'confirmed' : 'failed';
  }

  // ─── Fees ──────────────────────────────────────────────────────────

  /**
   * Estimate fees for a transaction.
   * Optionally accepts a pre-estimated gasLimit (from buildTransaction)
   * so the fee display matches reality. Defaults to 21000 for ETH transfers.
   */
  async estimateFees(
    _params: RawTransaction,
    preEstimatedGas?: bigint,
  ): Promise<FeeEstimate> {
    const supports1559 = await this.detectEip1559();
    const gasLimit = preEstimatedGas ?? 21_000n;

    if (supports1559) {
      try {
        const feeData = await this.publicClient.estimateFeesPerGas();
        const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice!;
        return {
          level: 'medium',
          gasLimit: gasLimit.toString(),
          gasPrice: gasPrice.toString(),
          totalFee: (gasPrice * gasLimit).toString(),
        };
      } catch {
        // Fall through to legacy fallback below
      }
    }

    // Legacy gas price path (BSC, etc.)
    const gasPrice = await this.publicClient.getGasPrice();
    return {
      level: 'medium',
      gasLimit: gasLimit.toString(),
      gasPrice: gasPrice.toString(),
      totalFee: (gasPrice * gasLimit).toString(),
    };
  }

  /** Convert a human-readable amount to raw wei */
  parseAmount(amount: string): string {
    return parseUnits(amount, this.config.nativeDecimals).toString();
  }
}

export { toEip55Address, validateEip55Address } from './utils.js';
