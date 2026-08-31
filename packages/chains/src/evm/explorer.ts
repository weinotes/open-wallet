/**
 * Block Explorer API client — Etherscan-compatible JSON-RPC style endpoints.
 *
 * Almost every EVM block explorer (Etherscan, BscScan, PolygonScan,
 * Arbiscan, Snowtrace, Basescan, Optimistic Etherscan...) exposes the
 * same API shape:
 *
 *   GET {explorer}/api?module=account&action=txlist&address=...&page=1&offset=50
 *
 * This client wraps that contract + a few common endpoints, plus
 * optional API-key authentication.
 */

// ─── Explorer API URL resolution ────────────────────────────────────
//
// Each explorer has a fixed API path. The public-facing URL in the
// chain config (e.g. "https://bscscan.com") is NOT the API base.
// We map each known explorer root to its API endpoint prefix.

interface ExplorerApiEndpoint {
  /** Human-readable explorer name */
  label: string;
  /** Base URL for API calls (NO trailing slash) */
  apiBase: string;
}

/**
 * Map a public explorer URL (from ChainConfig) to its API endpoint.
 * Covers all chains we support. Unknown explorers are handled by
 * deriving /api from the public URL — works for most major ones.
 */
function resolveExplorerApi(publicUrl: string): ExplorerApiEndpoint {
  const lower = publicUrl.toLowerCase();

  // Known explorers with a fixed /api path
  if (lower.includes('etherscan')) {
    return { label: 'Etherscan', apiBase: `https://api${lower.includes('testnet') ? '-testnet' : ''}.etherscan.io` };
  }
  if (lower.includes('bscscan')) {
    return { label: 'BscScan', apiBase: lower.includes('testnet') ? 'https://api-testnet.bscscan.com' : 'https://api.bscscan.com' };
  }
  if (lower.includes('polygonscan')) {
    return { label: 'PolygonScan', apiBase: lower.includes('testnet') ? 'https://api-testnet.polygonscan.com' : 'https://api.polygonscan.com' };
  }
  if (lower.includes('arbiscan')) {
    return { label: 'Arbiscan', apiBase: 'https://api.arbiscan.io' };
  }
  if (lower.includes('optimistic.etherscan')) {
    return { label: 'Optimistic', apiBase: 'https://api-optimistic.etherscan.io' };
  }
  if (lower.includes('basescan')) {
    return { label: 'BaseScan', apiBase: 'https://api.basescan.org' };
  }
  if (lower.includes('snowtrace')) {
    return { label: 'Snowtrace', apiBase: 'https://api.snowtrace.io' };
  }

  // Generic fallback — try /api path
  return { label: 'Explorer', apiBase: `${publicUrl.replace(/\/$/, '')}/api` };
}

// ─── Response types ─────────────────────────────────────────────────

interface ExplorerBaseResponse {
  status: '1' | '0';
  message: string;
}

export interface ExplorerNativeTx {
  blockNumber: string;
  timeStamp: string;          // unix seconds
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;              // wei
  gas: string;
  gasPrice: string;
  isError: '0' | '1';         // 0 = success, 1 = failed
  txreceipt_status?: string;  // '1' confirmed, '0' failed, undefined = pending
  input: string;
  contractAddress?: string;   // if this tx created a contract
  cumulativeGasUsed?: string;
  gasUsed?: string;
  confirmations?: string;
}

export interface ExplorerTokenTx extends ExplorerNativeTx {
  tokenSymbol?: string;
  tokenName?: string;
  tokenDecimal?: string;      // e.g. "18"
  contractAddress?: string;   // the ERC20 contract
  // value field is in token's smallest unit
}

/** Shape returned by Explorer `tokenbalance` wildcard query */
interface ExplorerTokenBalance {
  TokenAddress: string;
  TokenName: string;
  TokenSymbol: string;
  TokenDecimal: string;
  Balance: string;
}

// ─── HTTP layer ─────────────────────────────────────────────────────

export interface ExplorerClientOptions {
  /** Public explorer URL, e.g. "https://bscscan.com" */
  explorerUrl: string;
  /** Optional API key (major explorers limit unauthenticated calls to ~5/sec) */
  apiKey?: string;
  /** Max requests per second; default 4 (safe for free tier) */
  rateLimitRps?: number;
  /** Request timeout in ms; default 15000 */
  timeoutMs?: number;
}

/** Thin queue to rate-limit concurrent explorer calls */
class RateLimiter {
  private readonly minInterval: number;
  private lastCall = 0;

  constructor(rps: number) {
    this.minInterval = 1000 / Math.max(1, rps);
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minInterval) {
      await new Promise(r => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastCall = Date.now();
  }
}

/** Generic explorer API client — etherscan-compatible endpoints */
export class ExplorerClient {
  private readonly endpoint: ExplorerApiEndpoint;
  private readonly apiKey?: string;
  private readonly limiter: RateLimiter;
  private readonly timeoutMs: number;

  constructor(opts: ExplorerClientOptions) {
    this.endpoint = resolveExplorerApi(opts.explorerUrl);
    this.apiKey = opts.apiKey;
    this.limiter = new RateLimiter(opts.rateLimitRps ?? 4);
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  /** Derive explorer page URL for a given tx hash */
  public txUrl(txHash: string): string {
    const base = this.endpoint.label === 'Explorer'
      ? this.endpoint.apiBase.replace(/\/api$/, '')
      : this.basePublicUrl();
    return `${base}/tx/${txHash}`;
  }

  /** Derive explorer page URL for a given address */
  public addressUrl(address: string): string {
    return `${this.basePublicUrl()}/address/${address}`;
  }

  // ─── Core fetch ──────────────────────────────────────────────────

  private basePublicUrl(): string {
    // e.g. "https://api.bscscan.com" → "https://bscscan.com"
    // and "https://api-testnet.bscscan.com" → "https://testnet.bscscan.com"
    const url = new URL(this.endpoint.apiBase);
    let hostname = url.hostname;
    hostname = hostname.replace(/^api-testnet\./, 'testnet.');
    hostname = hostname.replace(/^api\./, '');
    hostname = hostname.replace(/^api-optimistic\./, 'optimistic.');
    return `${url.protocol}//${hostname}`;
  }

  private async call(
    params: Record<string, string | number>,
  ): Promise<ExplorerBaseResponse & { result: unknown }> {
    await this.limiter.wait();

    const url = new URL(this.endpoint.apiBase);
    url.searchParams.set('module', String(params.module));
    url.searchParams.set('action', String(params.action));
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'module' && k !== 'action') {
        url.searchParams.set(k, String(v));
      }
    }
    if (this.apiKey) {
      url.searchParams.set('apikey', this.apiKey);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Explorer HTTP ${res.status}: ${this.endpoint.label}`);
      }
      const json = (await res.json()) as ExplorerBaseResponse & { result: unknown };
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── High-level endpoints ────────────────────────────────────────

  /**
   * Fetch native-token (ETH/BNB/etc.) transactions for an address.
   * Returns at most `maxCount` records across paginated calls.
   *
   * Only successful transactions are returned by default (isError=0).
   */
  async getNativeTransactions(
    address: string,
    maxCount = 50,
  ): Promise<ExplorerNativeTx[]> {
    const all: ExplorerNativeTx[] = [];
    let page = 1;
    const pageSize = Math.min(maxCount, 50);
    let keepGoing = true;

    while (keepGoing && all.length < maxCount) {
      const resp = await this.call({
        module: 'account',
        action: 'txlist',
        address,
        startblock: 0,
        endblock: 'latest',
        page,
        offset: pageSize,
        sort: 'desc',
      });

      if (resp.status !== '1') {
        // "No transactions found" — that's fine, empty list
        if (
          resp.message.includes('No records') ||
          resp.result === 'No transactions found' ||
          (Array.isArray(resp.result) && resp.result.length === 0)
        ) {
          break;
        }
        throw new Error(`Explorer error [${this.endpoint.label}]: ${resp.message}`);
      }

      const batch = resp.result as ExplorerNativeTx[];
      all.push(...batch);

      if (batch.length < pageSize) {
        keepGoing = false;   // last page
      }
      page++;
    }

    return all.slice(0, maxCount);
  }

  /**
   * Fetch ERC20 token transfers for an address.
   * Same pagination behavior as getNativeTransactions.
   */
  async getTokenTransactions(
    address: string,
    maxCount = 30,
  ): Promise<ExplorerTokenTx[]> {
    const resp = await this.call({
      module: 'account',
      action: 'tokentx',
      address,
      page: 1,
      offset: maxCount,
      sort: 'desc',
    });

    if (resp.status !== '1') {
      if (
        resp.message.includes('No records') ||
        resp.result === 'No transactions found' ||
        (Array.isArray(resp.result) && resp.result.length === 0)
      ) {
        return [];
      }
      throw new Error(`Explorer error [${this.endpoint.label}]: ${resp.message}`);
    }

    return (resp.result as ExplorerTokenTx[]).slice(0, maxCount);
  }

  /**
   * Fetch ALL transactions — native + ERC20 token — merged and sorted.
   * Returns up to `maxCount` records, sorted newest first.
   */
  async getAllTransactions(
    address: string,
    maxCount = 50,
  ): Promise<ExplorerNativeTx[]> {
    const [native, tokens] = await Promise.all([
      this.getNativeTransactions(address, maxCount),
      this.getTokenTransactions(address, Math.min(maxCount, 30)),
    ]);

    const all = [...native, ...tokens.map(t => t as ExplorerNativeTx)];
    // Sort by block timestamp descending
    all.sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp));
    return all.slice(0, maxCount);
  }

  // ─── Token balances ───────────────────────────────────────────────

  /**
   * Fetch ALL ERC20 token balances for an address via `tokenbalance`
   * with `contractaddress=0x0000000000000000000000000000000000000000`.
   *
   * All major explorers (Etherscan, BscScan, PolygonScan) support this
   * "multi-balance" endpoint. Unknown explorers → returns [].
   *
   * Each balance also includes a single native-token query so callers
   * get the full portfolio from one call site.
   */
  async getAllBalances(
    address: string,
    nativeSymbol: string,
    nativeDecimals: number,
  ): Promise<{
    native: { symbol: string; decimals: number; balance: string };
    tokens: ExplorerTokenBalance[];
  }> {
    // 1) Native balance — direct RPC call wrapped by explorer
    //    We use `balance` action which is always supported.
    let nativeBalance = '0';
    try {
      const nativeResp = await this.call({
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
      });
      if (nativeResp.status === '1' && typeof nativeResp.result === 'string') {
        nativeBalance = nativeResp.result;
      }
    } catch {
      // Explorer down — native balance will be fetched from RPC by caller
    }

    // 2) ERC20 token list — contractaddress=0x000... means "all tokens"
    let tokens: ExplorerTokenBalance[] = [];
    try {
      const tokenResp = await this.call({
        module: 'account',
        action: 'tokenbalance',
        address,
        contractaddress: '0x0000000000000000000000000000000000000000',
        tag: 'latest',
      });
      if (tokenResp.status === '1' && Array.isArray(tokenResp.result)) {
        tokens = tokenResp.result as ExplorerTokenBalance[];
      }
    } catch {
      // Explorer may not support the wildcard contractaddress — that's OK
    }

    // Filter out zero-balances (explorers often return every token ever held)
    tokens = tokens.filter(t => t.Balance !== '0' && t.Balance !== '');

    return {
      native: { symbol: nativeSymbol, decimals: nativeDecimals, balance: nativeBalance },
      tokens,
    };
  }
}
