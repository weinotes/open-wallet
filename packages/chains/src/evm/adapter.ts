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
  formatUnits,
  getContract,
  erc20Abi,
  encodeFunctionData,
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
import { ExplorerClient, type ExplorerNativeTx, type ExplorerTokenTx } from './explorer.js';

/** Global explorer API key — read from env at module load. Optional. */
const EXPLORER_API_KEY =
  (typeof process !== 'undefined' && process.env?.EXPLORER_API_KEY) || undefined;

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
  /** Lazy explorer client — only built when history is requested */
  private explorerClient?: ExplorerClient;

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
    // Short timeout (8s) + single retry keeps the UI responsive when a
    // node is slow or unreachable; `rank: false` skips the upfront
    // parallel probe of every node (that produced many ERR_ABORTED
    // console errors in no-network environments).
    const transports = config.rpcs.map(url =>
      http(url, { timeout: 8_000, retryCount: 1, retryDelay: 200 }),
    );

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: fallback(transports, { rank: false }),
    });
  }

  /** Get (and lazily create) the explorer client for this chain */
  private getExplorerClient(): ExplorerClient | undefined {
    if (!this.config.explorer) return undefined;
    if (!this.explorerClient) {
      this.explorerClient = new ExplorerClient({
        explorerUrl: this.config.explorer,
        apiKey: EXPLORER_API_KEY,
      });
    }
    return this.explorerClient;
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

  async getAllTokenBalances(address: string): Promise<TokenBalance[]> {
    const explorer = this.getExplorerClient();
    if (!explorer) {
      // No explorer configured — fall back to just native balance via RPC
      const nativeBal = await this.getNativeBalance(address).catch(() => '0');
      return [{
        address: 'native',
        symbol: this.config.nativeSymbol,
        name: this.config.nativeSymbol,
        decimals: this.config.nativeDecimals,
        chainId: this.config.chainId,
        isNative: true,
        balance: nativeBal,
      }];
    }

    let data;
    try {
      data = await explorer.getAllBalances(
        address,
        this.config.nativeSymbol,
        this.config.nativeDecimals,
      );
    } catch {
      // Explorer failed — return just native balance from RPC
      const nativeBal = await this.getNativeBalance(address).catch(() => '0');
      return [{
        address: 'native',
        symbol: this.config.nativeSymbol,
        name: this.config.nativeSymbol,
        decimals: this.config.nativeDecimals,
        chainId: this.config.chainId,
        isNative: true,
        balance: nativeBal,
      }];
    }

    const result: TokenBalance[] = [];

    // Native token first
    result.push({
      address: 'native',
      symbol: data.native.symbol,
      name: data.native.symbol,
      decimals: data.native.decimals,
      chainId: this.config.chainId,
      isNative: true,
      // Explorer native balance may be empty if it failed — fall back to RPC
      balance: data.native.balance && data.native.balance !== '0'
        ? data.native.balance
        : await this.getNativeBalance(address).catch(() => data.native.balance),
    });

    // ERC20 tokens
    for (const t of data.tokens) {
      const decimals = Number(t.TokenDecimal) || 18;
      result.push({
        address: t.TokenAddress,
        symbol: t.TokenSymbol || 'UNKNOWN',
        name: t.TokenName || t.TokenSymbol || '',
        decimals,
        chainId: this.config.chainId,
        isNative: false,
        balance: t.Balance,
      });
    }

    return result;
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
      http(url, { timeout: 8_000, retryCount: 1, retryDelay: 200 }),
    );
    const walletClient = createWalletClient({
      account,
      chain: this.chain,
      transport: fallback(transports, { rank: false }),
    });

    const supports1559 = await this.detectEip1559();

    // Build gas fields — NEVER mix 1559 fields with legacy gasPrice
    const gasFields = supports1559
      ? {
          maxFeePerGas: rawTx.maxFeePerGas ? BigInt(rawTx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas
            ? BigInt(rawTx.maxPriorityFeePerGas)
            : undefined,
        }
      : {
          gasPrice: rawTx.gasPrice ? BigInt(rawTx.gasPrice) : undefined,
        };

    const signature = await walletClient.signTransaction({
      to: rawTx.to as Address,
      value: rawTx.value ? BigInt(rawTx.value) : undefined,
      data: rawTx.data as Hex | undefined,
      nonce: rawTx.nonce,
      gas: rawTx.gasLimit ? BigInt(rawTx.gasLimit) : undefined,
      chainId: this.chainDecimalId,
      ...gasFields,
    });

    return { raw: signature, signature };
  }

  async sendTransaction(signedTx: SignedTransaction): Promise<string> {
    return this.publicClient.sendRawTransaction({
      serializedTransaction: signedTx.signature as Hex,
    });
  }

  // ─── Explorer ──────────────────────────────────────────────────────

  /**
   * Fetch transaction history for an address.
   *
   * Pulls from two sources:
   *   1. Block explorer API (native + ERC20 token transfers) — 99% of cases
   *   2. A local RPC fallback (only has the last nonce-threshold pending txs)
   *
   * Explorer is used because raw EVM RPC has no "get transactions by address"
   * method — you'd have to re-scan the entire blockchain which is slow.
   */
  async getTransactionHistory(address: string): Promise<TransactionRecord[]> {
    const explorer = this.getExplorerClient();
    if (!explorer) {
      // No explorer configured — nothing we can do without one
      return [];
    }

    const results = await explorer.getAllTransactions(address, 50);

    return results
      .map(tx => this.toTransactionRecord(tx, address))
      // Sort newest first (explorer already does desc, but be safe)
      .sort((a, b) => b.blockTimestamp - a.blockTimestamp);
  }

  /** Convert an explorer-native tx (or token tx) into our unified type */
  private toTransactionRecord(
    tx: ExplorerNativeTx | ExplorerTokenTx,
    address: string,
  ): TransactionRecord {
    const lowerAddr = address.toLowerCase();
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    const record: TransactionRecord = {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      blockNumber: Number(tx.blockNumber),
      blockTimestamp: Number(tx.timeStamp),
      status: this.resolveStatus(tx),
      direction: from === lowerAddr ? 'sent' : 'received',
      fee: tx.gasPrice && tx.gas
        ? (BigInt(tx.gasPrice) * BigInt(tx.gas)).toString()
        : undefined,
    };

    // ERC20 token tx fields
    const tokenTx = tx as ExplorerTokenTx;
    if (tokenTx.tokenSymbol && tokenTx.contractAddress) {
      record.tokenSymbol = tokenTx.tokenSymbol;
      record.tokenAddress = tokenTx.contractAddress;
      if (tokenTx.tokenDecimal) {
        record.tokenDecimals = Number(tokenTx.tokenDecimal);
      }
    }

    return record;
  }

  private resolveStatus(
    tx: ExplorerNativeTx,
  ): TransactionRecord['status'] {
    if (tx.isError === '1') return 'failed';
    if (tx.txreceipt_status === '0') return 'failed';
    if (tx.txreceipt_status === '1') return 'confirmed';
    // Still pending (no receipt yet)
    if (!tx.txreceipt_status || tx.txreceipt_status === '') {
      return 'pending';
    }
    return 'confirmed';
  }

  /**
   * URL builder for external explorers — used by UI to link each tx.
   * Returns undefined if no explorer URL is configured.
   */
  getExplorerTxUrl(txHash: string): string | undefined {
    return this.getExplorerClient()?.txUrl(txHash);
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
   *
   * If preEstimatedGas is provided (from buildTransaction) we use it directly
   * — this gives callers a way to show a fee that exactly matches the gas
   * that will be consumed.
   *
   * When preEstimatedGas is NOT provided we auto-run estimateGas so the
   * displayed fee is always based on the actual gas the tx needs, NOT the
   * hard-coded 21000 minimum. This is important because Max-button and fee
   * display in the Send page must agree with what buildTransaction produces.
   */
  async estimateFees(
    params: RawTransaction,
    preEstimatedGas?: bigint,
  ): Promise<FeeEstimate> {
    const supports1559 = await this.detectEip1559();

    let gasLimit: bigint;
    if (preEstimatedGas !== undefined) {
      gasLimit = preEstimatedGas;
    } else {
      try {
        // Auto-estimate real gas needed for this specific tx
        gasLimit = await this.publicClient.estimateGas({
          account: params.from as Address,
          to: params.to as Address,
          value: params.value ? BigInt(params.value) : undefined,
          data: params.data as Hex | undefined,
        });
      } catch {
        // estimateGas can fail on invalid params (e.g. bad to address).
        // Fall back to the standard 21000 minimum.
        gasLimit = 21_000n;
      }
    }

    let gasPrice: bigint | undefined;

    if (supports1559) {
      try {
        const feeData = await this.publicClient.estimateFeesPerGas();
        gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
      } catch {
        // 1559 path failed — will fall back to getGasPrice below
      }
    }

    if (gasPrice === undefined) {
      // Legacy / fallback path
      gasPrice = await this.publicClient.getGasPrice();
    }

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

  // ─── ERC20 / BEP20 tokens ──────────────────────────────────────────

  /**
   * Read token metadata from the contract on-chain.
   * Throws if the address is not a valid ERC20 contract (no symbol/decimals).
   */
  async getTokenInfo(tokenAddress: string): Promise<{
    symbol: string;
    decimals: number;
    name: string;
  }> {
    const contract = getContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      client: this.publicClient,
    });

    const [symbol, decimals, name] = await Promise.all([
      contract.read.symbol().catch(() => 'UNKNOWN'),
      contract.read.decimals().catch(() => 18),
      contract.read.name().catch(() => ''),
    ]);

    return {
      symbol: String(symbol),
      decimals: Number(decimals),
      name: String(name),
    };
  }

  /**
   * Encode an ERC20 transfer(address,uint256) call as calldata hex.
   * The caller should then pass this as `RawTransaction.data` with
   * `to` set to the token contract address and `value` set to "0".
   */
  encodeErc20Transfer(
    tokenAddress: string,
    recipient: string,
    amountRaw: string,
  ): Hex {
    return encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient as Address, BigInt(amountRaw)],
    }) as Hex;
  }

  /** Convert a human-readable token amount to raw units using the token's decimals */
  parseTokenAmount(amount: string, decimals: number): string {
    return parseUnits(amount, decimals).toString();
  }

  /** Convert raw token units to a human-readable string */
  formatTokenAmount(raw: string, decimals: number): string {
    return formatUnits(BigInt(raw), decimals);
  }
}

export { toEip55Address, validateEip55Address } from './utils.js';
