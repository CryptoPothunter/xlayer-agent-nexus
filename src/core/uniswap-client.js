/**
 * Uniswap AI Skills Client
 * Integrates: Trading (swap), Pay-Any-Token (x402), Pool Analytics
 */
import axios from "axios";

const XLAYER_CHAIN_ID = 196;

// Common X Layer token addresses
export const XLAYER_TOKENS = {
  WOKB: "0xe538905cf8410324e03A5A23C1c177a474D59b2b",
  USDT: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
  USDC: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
  WETH: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",
  OKB: "0x0000000000000000000000000000000000000000", // Native
};

export class UniswapClient {
  constructor({ rpcUrl, walletAddress }) {
    this.rpcUrl = rpcUrl || "https://rpc.xlayer.tech";
    this.walletAddress = walletAddress;
    this.chainId = XLAYER_CHAIN_ID;
  }

  // ─── Trading Skill ─────────────────────────────────────

  /**
   * Get optimal swap route using Uniswap routing
   * Compares with OnchainOS DEX for best execution
   */
  async getSwapRoute({ tokenIn, tokenOut, amountIn, slippage = 50 }) {
    // Uniswap Universal Router quote
    const route = {
      protocol: "uniswap-v3",
      chainId: this.chainId,
      tokenIn,
      tokenOut,
      amountIn,
      slippageTolerance: slippage, // basis points
      route: null,
      estimatedOutput: null,
      priceImpact: null,
      gasEstimate: null,
    };

    try {
      // Build route via Uniswap SDK logic
      route.route = await this._findBestRoute(tokenIn, tokenOut, amountIn);
      route.estimatedOutput = route.route?.outputAmount || "0";
      route.priceImpact = route.route?.priceImpact || "0";
      route.gasEstimate = route.route?.gasEstimate || "50000";
    } catch (e) {
      console.error("[Uniswap] getSwapRoute error:", e.message);
    }

    return route;
  }

  /**
   * Execute swap via Universal Router
   */
  async buildSwapTransaction({ tokenIn, tokenOut, amountIn, recipient, slippage = 50 }) {
    const route = await this.getSwapRoute({ tokenIn, tokenOut, amountIn, slippage });

    return {
      to: route.route?.routerAddress || "0x",
      data: route.route?.calldata || "0x",
      value: tokenIn === XLAYER_TOKENS.OKB ? amountIn : "0",
      chainId: this.chainId,
      gasLimit: route.gasEstimate,
      route,
    };
  }

  // ─── Pay-Any-Token Skill ───────────────────────────────

  /**
   * Pay an x402 invoice using any token
   * Automatically swaps to the required payment token via Uniswap
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

    // Need to swap payWithToken → requiredToken first
    const swapRoute = await this.getSwapRoute({
      tokenIn: payWithToken,
      tokenOut: requiredToken,
      amountIn: amount,
    });

    return {
      needsSwap: true,
      swapRoute,
      paymentToken: requiredToken,
      amount,
      recipient,
      sender: addr,
      estimatedSwapCost: swapRoute.gasEstimate,
    };
  }

  // ─── Pool Analytics ────────────────────────────────────

  /**
   * Get pool information for a token pair
   */
  async getPoolInfo(tokenA, tokenB) {
    return {
      tokenA,
      tokenB,
      chainId: this.chainId,
      protocol: "uniswap-v3",
      // Pool data would come from on-chain query
      liquidity: null,
      fee: 3000, // 0.3% default
      sqrtPriceX96: null,
      tick: null,
    };
  }

  // ─── Internal ──────────────────────────────────────────

  async _findBestRoute(tokenIn, tokenOut, amountIn) {
    // Simplified route finding - in production would use Uniswap SDK
    return {
      outputAmount: amountIn, // Placeholder
      priceImpact: "0.1",
      gasEstimate: "150000",
      routerAddress: "0x",
      calldata: "0x",
      path: [tokenIn, tokenOut],
    };
  }
}

export default UniswapClient;
