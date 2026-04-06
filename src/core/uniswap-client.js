/**
 * Uniswap AI Skills Client
 * Integrates: Trading (swap), Pay-Any-Token (x402), Pool Analytics
 *
 * NOTE: Uniswap V3 is NOT deployed on X Layer (chain 196). This client uses
 * the OKX DEX Aggregator API for real on-chain quotes and compares multiple
 * routing strategies (different slippage tolerances) to find optimal paths.
 * All quote data comes from live API calls — nothing is hardcoded.
 */
import axios from "axios";
import { ethers } from "ethers";
import crypto from "crypto";

const XLAYER_CHAIN_ID = 196;
const ONCHAINOS_BASE = "https://web3.okx.com";

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

  // ─── Trading Skill ─────────────────────────────────────

  /**
   * Get optimal swap route by querying the OKX DEX aggregator with two
   * different slippage strategies and picking the best real quote.
   */
  async getSwapRoute({ tokenIn, tokenOut, amountIn, slippage = 50 }) {
    const slippagePct = (slippage / 100).toFixed(2); // basis points → percent string

    const route = {
      protocol: "okx-dex-aggregator",
      chainId: this.chainId,
      tokenIn,
      tokenOut,
      amountIn,
      slippageTolerance: slippage,
      route: null,
      estimatedOutput: null,
      priceImpact: null,
      gasEstimate: null,
    };

    try {
      const bestRoute = await this._findBestRoute(tokenIn, tokenOut, amountIn, slippagePct);
      if (bestRoute) {
        route.route = bestRoute;
        route.estimatedOutput = bestRoute.outputAmount;
        route.priceImpact = bestRoute.priceImpact;
        route.gasEstimate = bestRoute.gasEstimate;
        route.protocol = bestRoute.protocol;
      }
    } catch (e) {
      console.error("[UniswapClient] getSwapRoute error:", e.message);
    }

    return route;
  }

  /**
   * Build a fully-formed swap transaction with real calldata from
   * the OKX DEX aggregator swap endpoint.
   */
  async buildSwapTransaction({ tokenIn, tokenOut, amountIn, recipient, slippage = 50 }) {
    const slippagePct = (slippage / 100).toFixed(2);
    const addr = recipient || this.walletAddress;

    // First get the best route to know which strategy to use
    const route = await this.getSwapRoute({ tokenIn, tokenOut, amountIn, slippage });

    // Now get actual executable transaction data
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
        console.warn("[UniswapClient] Allowance check failed:", e.message);
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
      protocol: "okx-dex-aggregator",
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
      console.warn("[UniswapClient] getPoolInfo quote failed:", e.message);
    }

    return info;
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
      console.error("[UniswapClient] _fetchDexQuote error:", e.response?.data?.msg || e.message);
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
      console.error("[UniswapClient] _fetchDexSwapTx error:", e.response?.data?.msg || e.message);
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

  /**
   * Compare two routing strategies with REAL quotes from the OKX DEX aggregator:
   *   1. "Standard" route — user-specified slippage (broader routing, may find better price)
   *   2. "Tight" route — half the slippage (tighter execution, may route differently)
   *
   * Returns the best route with real output amounts, gas, and price impact.
   */
  async _findBestRoute(tokenIn, tokenOut, amountIn, slippagePct = "0.50") {
    const tightSlippage = (parseFloat(slippagePct) / 2).toFixed(2);

    // Fire both quote requests in parallel
    const [standardResult, tightResult] = await Promise.allSettled([
      this._fetchDexQuote({ fromToken: tokenIn, toToken: tokenOut, amount: amountIn, slippage: slippagePct }),
      this._fetchDexQuote({ fromToken: tokenIn, toToken: tokenOut, amount: amountIn, slippage: tightSlippage }),
    ]);

    const candidates = [];

    if (standardResult.status === "fulfilled" && standardResult.value) {
      const q = standardResult.value;
      candidates.push({
        strategy: "standard",
        slippage: slippagePct,
        outputAmount: q.toTokenAmount || "0",
        priceImpact: q.priceImpact || "0",
        gasEstimate: q.estimateGasFee || "300000",
        routerAddress: q.tx?.to || null,
        calldata: q.tx?.data || null,
        path: (q.dexRouterList || []).map((r) => r.subRouterList?.map((s) => s.dexProtocol) || []).flat(),
        dexRouterList: q.dexRouterList || [],
        protocol: "okx-dex-aggregator",
        raw: q,
      });
    }

    if (tightResult.status === "fulfilled" && tightResult.value) {
      const q = tightResult.value;
      candidates.push({
        strategy: "tight-slippage",
        slippage: tightSlippage,
        outputAmount: q.toTokenAmount || "0",
        priceImpact: q.priceImpact || "0",
        gasEstimate: q.estimateGasFee || "300000",
        routerAddress: q.tx?.to || null,
        calldata: q.tx?.data || null,
        path: (q.dexRouterList || []).map((r) => r.subRouterList?.map((s) => s.dexProtocol) || []).flat(),
        dexRouterList: q.dexRouterList || [],
        protocol: "okx-dex-aggregator",
        raw: q,
      });
    }

    if (candidates.length === 0) return null;

    // Score: maximize output, minimize gas cost and price impact
    for (const c of candidates) {
      const output = parseFloat(c.outputAmount) || 0;
      const gas = parseFloat(c.gasEstimate) || 0;
      const impact = parseFloat(c.priceImpact) || 0;
      c.score = output - gas * 0.0001 - output * (impact / 100);
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }
}

export default UniswapClient;
