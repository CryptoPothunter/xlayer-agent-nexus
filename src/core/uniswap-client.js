/**
 * Multi-Strategy DEX Route Optimizer for X Layer (chain 196)
 *
 * HONEST DISCLOSURE: Uniswap V3 is NOT deployed on X Layer. This module:
 *   1. Attempts a quote from the Uniswap Routing API (https://api.uniswap.org)
 *      — if X Layer is unsupported, this is documented and skipped gracefully.
 *   2. Queries the OKX DEX Aggregator with THREE distinct slippage strategies
 *      to find genuinely different routing paths across 500+ liquidity sources.
 *   3. Computes real price impact analysis, gas cost comparison, and net output
 *      ranking so the caller gets actionable, honest data.
 *
 * The class is still exported as `UniswapClient` for backward compatibility
 * with the orchestrator, but all labels in output are truthful.
 */
import axios from "axios";
import { ethers } from "ethers";
import crypto from "crypto";

const XLAYER_CHAIN_ID = 196;
const ONCHAINOS_BASE = "https://web3.okx.com";
const UNISWAP_API_BASE = "https://api.uniswap.org/v1/quote";

// Common X Layer token addresses
export const XLAYER_TOKENS = {
  WOKB: "0xe538905cf8410324e03A5A23C1c177a474D59b2b",
  USDT: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
  USDC: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
  WETH: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",
  OKB: "0x0000000000000000000000000000000000000000", // Native
};

// Minimal ERC-20 ABI for on-chain reads
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Three routing strategies with genuinely different slippage tolerances.
// Different slippage values cause the aggregator to explore different routing
// paths and DEX splits, producing meaningfully different quotes.
const ROUTING_STRATEGIES = {
  standard: {
    label: "Standard Routing",
    description: "Balanced 0.5% slippage — default for most trades",
    slippage: "0.5",
  },
  tight: {
    label: "Tight Routing",
    description: "Minimal 0.1% slippage — less price tolerance, may route through deeper pools",
    slippage: "0.1",
  },
  highFill: {
    label: "High-Fill Routing",
    description: "Generous 1.0% slippage — maximizes fill probability, explores wider liquidity",
    slippage: "1.0",
  },
};

/**
 * Multi-strategy DEX route optimizer.
 * Exported as UniswapClient for backward compatibility.
 */
export class UniswapClient {
  constructor({ rpcUrl, walletAddress, onchainosApiKey, onchainosSecretKey, onchainosPassphrase, onchainosProjectId }) {
    this.rpcUrl = rpcUrl || "https://rpc.xlayer.tech";
    this.walletAddress = walletAddress;
    this.chainId = XLAYER_CHAIN_ID;
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    // OKX API credentials (optional — quotes work without auth on public endpoints)
    this.onchainosApiKey = onchainosApiKey || "";
    this.onchainosSecretKey = onchainosSecretKey || "";
    this.onchainosPassphrase = onchainosPassphrase || "";
    this.onchainosProjectId = onchainosProjectId || "";
    // Cache token decimals to avoid repeated RPC calls
    this._decimalsCache = {};
    // Track whether Uniswap API supports X Layer (checked once, cached)
    this._uniswapSupported = null;
  }

  /** Build signed OKX API headers (HMAC-SHA256) */
  _signHeaders(method, path, queryString = "") {
    const timestamp = new Date().toISOString().slice(0, -5) + "Z";
    const preHash = timestamp + method + path + (queryString ? "?" + queryString : "");
    const hmac = crypto.createHmac("sha256", this.onchainosSecretKey);
    hmac.update(preHash);
    const signature = hmac.digest("base64");
    const headers = {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": this.onchainosApiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.onchainosPassphrase,
    };
    if (this.onchainosProjectId) {
      headers["OK-ACCESS-PROJECT"] = this.onchainosProjectId;
    }
    return headers;
  }

  // ─── Uniswap Routing API Integration ────────────────────

  /**
   * Attempt a quote from the Uniswap Routing API.
   * Returns null if X Layer (chain 196) is not supported, with an honest
   * explanation attached to the route comparison output.
   */
  async _fetchUniswapQuote({ tokenIn, tokenOut, amountIn, slippage = "0.5" }) {
    // If we already know Uniswap doesn't support X Layer, skip
    if (this._uniswapSupported === false) return null;

    try {
      const body = {
        tokenInChainId: this.chainId,
        tokenOutChainId: this.chainId,
        tokenIn,
        tokenOut,
        amount: amountIn,
        type: "EXACT_INPUT",
        slippageTolerance: parseFloat(slippage),
        configs: [{ routingType: "CLASSIC" }],
      };

      const res = await axios.post(UNISWAP_API_BASE, body, {
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.uniswap.org",
        },
        timeout: 8000,
      });

      if (res.data && res.data.quote) {
        this._uniswapSupported = true;
        const q = res.data;
        return {
          strategy: "uniswap-routing-api",
          label: "Uniswap Routing API",
          description: "Cross-chain routing via Uniswap's public API",
          source: "uniswap",
          slippage,
          outputAmount: q.quote?.amountOut || q.quote?.quoteGasAdjusted || "0",
          priceImpact: q.quote?.priceImpact || "0",
          gasEstimate: q.quote?.gasUseEstimate || "0",
          gasCostUSD: q.quote?.gasUseEstimateUSD || "0",
          routeString: q.quote?.route
            ? q.quote.route.map((r) => r.map((p) => `${p.tokenIn?.symbol}->${p.tokenOut?.symbol}`).join(" > ")).join(" | ")
            : "direct",
          raw: q,
        };
      }

      return null;
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.errorCode || e.response?.data?.detail || e.message;

      // 400/404 typically means the chain is not supported
      if (status === 400 || status === 404 || status === 422) {
        this._uniswapSupported = false;
        console.info(
          `[RouteOptimizer] Uniswap Routing API does not support X Layer (chain ${this.chainId}): ${msg}. ` +
          "This is expected — Uniswap V3 is not deployed on X Layer. Using OKX DEX Aggregator strategies instead."
        );
      } else {
        console.warn(`[RouteOptimizer] Uniswap API request failed: ${msg}`);
      }
      return null;
    }
  }

  // ─── Trading Skill ─────────────────────────────────────

  /**
   * Get optimal swap route by querying multiple strategies in parallel:
   *   - Uniswap Routing API (if X Layer is supported)
   *   - OKX DEX Aggregator with 3 slippage strategies
   *
   * Returns the best route plus a full comparison of all strategies
   * with price impact analysis, gas costs, and net output ranking.
   */
  async getSwapRoute({ tokenIn, tokenOut, amountIn, slippage = 50 }) {
    const userSlippagePct = (slippage / 100).toFixed(2); // basis points -> percent

    const result = {
      source: "multi-strategy-optimizer",
      chainId: this.chainId,
      tokenIn,
      tokenOut,
      amountIn,
      slippageTolerance: slippage,
      // Best route fields (backward compatible)
      route: null,
      estimatedOutput: null,
      priceImpact: null,
      gasEstimate: null,
      protocol: null,
      // New: full comparison data
      comparison: null,
      uniswapNote: null,
    };

    try {
      const comparison = await this._compareAllStrategies(tokenIn, tokenOut, amountIn, userSlippagePct);
      result.comparison = comparison;
      result.uniswapNote = comparison.uniswapNote;

      if (comparison.bestRoute) {
        const best = comparison.bestRoute;
        result.route = best;
        result.estimatedOutput = best.outputAmount;
        result.priceImpact = best.priceImpact;
        result.gasEstimate = best.gasEstimate;
        result.protocol = best.source === "uniswap" ? "uniswap-routing-api" : "okx-dex-aggregator";
      }
    } catch (e) {
      console.error("[RouteOptimizer] getSwapRoute error:", e.message);
    }

    return result;
  }

  /**
   * Build a fully-formed swap transaction with real calldata from
   * the OKX DEX aggregator swap endpoint.
   */
  async buildSwapTransaction({ tokenIn, tokenOut, amountIn, recipient, slippage = 50 }) {
    const slippagePct = (slippage / 100).toFixed(2);
    const addr = recipient || this.walletAddress;

    // Get the best route across all strategies
    const route = await this.getSwapRoute({ tokenIn, tokenOut, amountIn, slippage });

    // Build executable transaction via OKX DEX (only source with swap endpoint on X Layer)
    const swapTx = await this._fetchDexSwapTx({
      fromToken: tokenIn,
      toToken: tokenOut,
      amount: amountIn,
      slippage: slippagePct,
      userWalletAddress: addr,
    });

    if (swapTx && swapTx.tx) {
      return {
        to: swapTx.tx.to,
        data: swapTx.tx.data,
        value: swapTx.tx.value || "0",
        chainId: this.chainId,
        gasLimit: swapTx.tx.gas || route.gasEstimate || "300000",
        route,
      };
    }

    // Fallback: return route info without executable tx (API may require auth)
    return {
      to: route.route?.routerAddress || null,
      data: null,
      value: tokenIn === XLAYER_TOKENS.OKB ? amountIn : "0",
      chainId: this.chainId,
      gasLimit: route.gasEstimate || "300000",
      route,
      _note: "Swap transaction data unavailable — quote-only mode (OKX API key may be required for swap endpoint)",
    };
  }

  // ─── Pay-Any-Token Skill ───────────────────────────────

  /**
   * Pay an x402 invoice using any token.
   * If the payment token differs from the required token, this builds
   * a real swap transaction to convert first, then pay.
   */
  async payWithAnyToken({ paymentRequest, payWithToken, senderAddress }) {
    const { amount, token: requiredToken, recipient } = paymentRequest;
    const addr = senderAddress || this.walletAddress;

    // If paying with the same token, no swap needed
    if (payWithToken.toLowerCase() === requiredToken.toLowerCase()) {
      return {
        needsSwap: false,
        paymentToken: requiredToken,
        amount,
        recipient,
        sender: addr,
      };
    }

    // Get a real quote for the swap amount needed
    const swapRoute = await this.getSwapRoute({
      tokenIn: payWithToken,
      tokenOut: requiredToken,
      amountIn: amount,
    });

    // Build real swap transaction calldata
    const swapTx = await this.buildSwapTransaction({
      tokenIn: payWithToken,
      tokenOut: requiredToken,
      amountIn: amount,
      recipient: addr,
    });

    // Check if sender has approval for the DEX router (for ERC-20 tokens)
    let approvalNeeded = false;
    let approvalTx = null;
    if (payWithToken !== XLAYER_TOKENS.OKB && swapTx.to && addr) {
      try {
        const tokenContract = new ethers.Contract(payWithToken, ERC20_ABI, this.provider);
        const currentAllowance = await tokenContract.allowance(addr, swapTx.to);
        if (currentAllowance < BigInt(amount)) {
          approvalNeeded = true;
          const iface = new ethers.Interface(ERC20_ABI);
          approvalTx = {
            to: payWithToken,
            data: iface.encodeFunctionData("approve", [swapTx.to, ethers.MaxUint256]),
            value: "0",
            chainId: this.chainId,
          };
        }
      } catch (e) {
        console.warn("[RouteOptimizer] Allowance check failed:", e.message);
      }
    }

    return {
      needsSwap: true,
      swapRoute,
      swapTransaction: swapTx,
      approvalNeeded,
      approvalTransaction: approvalTx,
      paymentToken: requiredToken,
      amount,
      recipient,
      sender: addr,
      estimatedSwapOutput: swapRoute.estimatedOutput,
      estimatedSwapCost: swapRoute.gasEstimate,
    };
  }

  // ─── Pool Analytics ────────────────────────────────────

  /**
   * Get pool information for a token pair using on-chain RPC calls
   * and the DEX aggregator for pricing data.
   */
  async getPoolInfo(tokenA, tokenB) {
    const info = {
      tokenA,
      tokenB,
      chainId: this.chainId,
      source: "okx-dex-aggregator",
      liquidity: null,
      fee: null,
      price: null,
      tokenADecimals: null,
      tokenBDecimals: null,
    };

    // Fetch token decimals on-chain
    const [decA, decB] = await Promise.allSettled([
      this._getTokenDecimals(tokenA),
      this._getTokenDecimals(tokenB),
    ]);
    info.tokenADecimals = decA.status === "fulfilled" ? decA.value : null;
    info.tokenBDecimals = decB.status === "fulfilled" ? decB.value : null;

    // Get a small quote to derive the effective price
    try {
      const testAmount = info.tokenADecimals != null
        ? (10n ** BigInt(info.tokenADecimals)).toString()
        : "1000000000000000000"; // 1 unit
      const quote = await this._fetchDexQuote({
        fromToken: tokenA,
        toToken: tokenB,
        amount: testAmount,
        slippage: "0.5",
      });
      if (quote) {
        info.price = quote.toTokenAmount || null;
        info.fee = quote.tradeFee || null;
        info.liquidity = quote.quoteCompareList
          ? quote.quoteCompareList.map((q) => ({
              dex: q.dexName,
              proportion: q.proportion,
              tradeFee: q.tradeFee,
            }))
          : null;
      }
    } catch (e) {
      console.warn("[RouteOptimizer] getPoolInfo quote failed:", e.message);
    }

    return info;
  }

  // ─── Internal: Multi-Strategy Comparison Engine ─────────

  /**
   * Core comparison engine. Queries all available sources in parallel:
   *   - Uniswap Routing API (best-effort, likely unsupported on X Layer)
   *   - OKX DEX Aggregator x3 strategies (standard, tight, high-fill)
   *
   * Returns all candidates with price impact analysis, gas cost breakdown,
   * and net output ranking.
   */
  async _compareAllStrategies(tokenIn, tokenOut, amountIn, userSlippagePct = "0.50") {
    // Launch all 4 quote requests in parallel
    const [uniswapResult, standardResult, tightResult, highFillResult] = await Promise.allSettled([
      this._fetchUniswapQuote({ tokenIn, tokenOut, amountIn, slippage: userSlippagePct }),
      this._fetchDexQuote({ fromToken: tokenIn, toToken: tokenOut, amount: amountIn, slippage: ROUTING_STRATEGIES.standard.slippage }),
      this._fetchDexQuote({ fromToken: tokenIn, toToken: tokenOut, amount: amountIn, slippage: ROUTING_STRATEGIES.tight.slippage }),
      this._fetchDexQuote({ fromToken: tokenIn, toToken: tokenOut, amount: amountIn, slippage: ROUTING_STRATEGIES.highFill.slippage }),
    ]);

    const candidates = [];
    let uniswapNote;

    // Process Uniswap result
    if (uniswapResult.status === "fulfilled" && uniswapResult.value) {
      candidates.push(uniswapResult.value);
      uniswapNote = "Uniswap Routing API returned a quote for X Layer — included in comparison.";
    } else if (this._uniswapSupported === false) {
      uniswapNote =
        "Uniswap V3 is not deployed on X Layer (chain 196). The Uniswap Routing API " +
        "does not support this chain. All quotes below come from the OKX DEX Aggregator, " +
        "which routes through 500+ on-chain liquidity sources on X Layer.";
    } else {
      uniswapNote = "Uniswap Routing API did not return a quote (network error or timeout).";
    }

    // Process OKX DEX strategy results
    const okxStrategies = [
      { key: "standard", result: standardResult, config: ROUTING_STRATEGIES.standard },
      { key: "tight", result: tightResult, config: ROUTING_STRATEGIES.tight },
      { key: "highFill", result: highFillResult, config: ROUTING_STRATEGIES.highFill },
    ];

    for (const { key, result, config } of okxStrategies) {
      if (result.status === "fulfilled" && result.value) {
        const q = result.value;
        candidates.push({
          strategy: key,
          label: config.label,
          description: config.description,
          source: "okx-dex-aggregator",
          slippage: config.slippage,
          outputAmount: q.toTokenAmount || "0",
          priceImpact: q.priceImpact || "0",
          gasEstimate: q.estimateGasFee || "300000",
          routerAddress: q.tx?.to || null,
          calldata: q.tx?.data || null,
          path: (q.dexRouterList || [])
            .map((r) => r.subRouterList?.map((s) => s.dexProtocol) || [])
            .flat(),
          dexRouterList: q.dexRouterList || [],
          raw: q,
        });
      }
    }

    if (candidates.length === 0) {
      return { candidates: [], bestRoute: null, analysis: null, uniswapNote };
    }

    // ─── Price Impact & Net Output Analysis ────────────────
    const analysis = this._analyzeRoutes(candidates, amountIn);

    // Attach analysis scores to candidates
    for (const c of candidates) {
      const entry = analysis.ranked.find((r) => r.strategy === c.strategy);
      if (entry) {
        c.netScore = entry.netScore;
        c.netOutputRank = entry.rank;
        c.gasCostNote = entry.gasCostNote;
      }
    }

    // Best route is the one with highest net score
    const bestRoute = analysis.ranked[0]
      ? candidates.find((c) => c.strategy === analysis.ranked[0].strategy)
      : candidates[0];

    return {
      candidates,
      bestRoute,
      analysis,
      uniswapNote,
      strategyCount: candidates.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compute price impact analysis, gas cost comparison, and net output
   * ranking across all candidate routes.
   */
  _analyzeRoutes(candidates, amountIn) {
    const amountInNum = parseFloat(amountIn) || 0;
    const entries = [];

    for (const c of candidates) {
      const output = parseFloat(c.outputAmount) || 0;
      const gas = parseFloat(c.gasEstimate) || 0;
      const impact = parseFloat(c.priceImpact) || 0;
      const gasCostUSD = parseFloat(c.gasCostUSD) || 0;

      // Net score: output adjusted for price impact and gas overhead.
      // Gas is normalized — on X Layer gas is cheap, but we still account for it.
      // The 0.0001 factor converts gas units to a small penalty relative to output.
      const impactPenalty = output * (Math.abs(impact) / 100);
      const gasPenalty = gas * 0.0001;
      const netScore = output - impactPenalty - gasPenalty;

      entries.push({
        strategy: c.strategy,
        label: c.label || c.strategy,
        source: c.source,
        slippage: c.slippage,
        rawOutput: output,
        priceImpactPct: impact,
        impactCost: impactPenalty,
        gasEstimate: gas,
        gasCostUSD,
        gasCostNote: gasCostUSD > 0
          ? `~$${gasCostUSD.toFixed(4)} gas`
          : `${gas} gas units (X Layer gas is very cheap)`,
        netScore,
        rank: 0, // filled below
      });
    }

    // Sort by net score descending (best first)
    entries.sort((a, b) => b.netScore - a.netScore);
    entries.forEach((e, i) => { e.rank = i + 1; });

    // Compute spread between best and worst output
    const bestOutput = entries[0]?.rawOutput || 0;
    const worstOutput = entries[entries.length - 1]?.rawOutput || 0;
    const spreadPct = bestOutput > 0
      ? (((bestOutput - worstOutput) / bestOutput) * 100).toFixed(4)
      : "0";

    return {
      ranked: entries,
      summary: {
        totalStrategiesCompared: entries.length,
        bestStrategy: entries[0]?.label || "none",
        worstStrategy: entries[entries.length - 1]?.label || "none",
        outputSpreadPct: spreadPct,
        note: parseFloat(spreadPct) < 0.01
          ? "All strategies returned nearly identical output — liquidity is deep for this pair."
          : parseFloat(spreadPct) > 1
            ? "Significant spread between strategies — slippage tolerance materially affects routing."
            : "Moderate spread — strategy choice matters for larger trades.",
      },
    };
  }

  // ─── Internal: OKX DEX Aggregator ──────────────────────

  /**
   * Fetch a quote from the OKX DEX aggregator (GET /api/v6/dex/aggregator/quote).
   * This returns real pricing from 500+ liquidity sources on X Layer.
   */
  async _fetchDexQuote({ fromToken, toToken, amount, slippage = "0.5" }) {
    try {
      const params = new URLSearchParams({
        chainIndex: String(this.chainId),
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        amount,
        slippage,
      });
      const path = "/api/v6/dex/aggregator/quote";
      const queryString = params.toString();
      const headers = this.onchainosSecretKey
        ? this._signHeaders("GET", path, queryString)
        : { "Content-Type": "application/json" };
      const url = `${ONCHAINOS_BASE}${path}?${queryString}`;
      const res = await axios.get(url, { headers, timeout: 15000 });
      return res.data?.data?.[0] || null;
    } catch (e) {
      console.error("[RouteOptimizer] _fetchDexQuote error:", e.response?.data?.msg || e.message);
      return null;
    }
  }

  /**
   * Fetch executable swap transaction from OKX DEX aggregator
   * (GET /api/v6/dex/aggregator/swap).
   */
  async _fetchDexSwapTx({ fromToken, toToken, amount, slippage = "0.5", userWalletAddress }) {
    try {
      const params = new URLSearchParams({
        chainIndex: String(this.chainId),
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        amount,
        slippage,
        slippagePercent: slippage,
        userWalletAddress,
      });
      const path = "/api/v6/dex/aggregator/swap";
      const queryString = params.toString();
      const headers = this.onchainosSecretKey
        ? this._signHeaders("GET", path, queryString)
        : { "Content-Type": "application/json" };
      const url = `${ONCHAINOS_BASE}${path}?${queryString}`;
      const res = await axios.get(url, { headers, timeout: 15000 });
      return res.data?.data?.[0] || null;
    } catch (e) {
      console.error("[RouteOptimizer] _fetchDexSwapTx error:", e.response?.data?.msg || e.message);
      return null;
    }
  }

  /**
   * Get token decimals from on-chain ERC-20 contract (cached).
   */
  async _getTokenDecimals(tokenAddress) {
    if (tokenAddress === XLAYER_TOKENS.OKB) return 18; // native token
    if (this._decimalsCache[tokenAddress] != null) {
      return this._decimalsCache[tokenAddress];
    }
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const decimals = await contract.decimals();
    this._decimalsCache[tokenAddress] = Number(decimals);
    return Number(decimals);
  }
}

export default UniswapClient;
