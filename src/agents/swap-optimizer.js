/**
 * Swap Optimizer Service Agent
 * Compares routes across OnchainOS DEX aggregator and Uniswap
 * to find the absolute best execution path for any swap on X Layer.
 *
 * This agent earns fees by providing superior route optimization.
 */

export class SwapOptimizerAgent {
  constructor({ onchainos, uniswap, registry, walletAddress }) {
    this.onchainos = onchainos;
    this.uniswap = uniswap;
    this.registry = registry;
    this.walletAddress = walletAddress;
    this.serviceId = null;
    this.callCount = 0;
    this.name = "SwapOptimizer";
  }

  /** Register this service on the marketplace */
  async register() {
    try {
      const { serviceId } = await this.registry.registerService({
        name: "SwapOptimizer",
        description:
          "Compares OnchainOS DEX (500+ sources) and Uniswap routing to find optimal swap paths. Returns best route with estimated output, price impact, and gas cost.",
        endpoint: `x402://agent/${this.walletAddress}/swap-optimizer`,
        pricePerCall: 0.01, // 0.01 USDT per optimization
      });
      this.serviceId = serviceId;
      console.log(`[SwapOptimizer] Registered with ID: ${serviceId}`);
      return serviceId;
    } catch (e) {
      console.error(`[SwapOptimizer] Registration failed:`, e.message);
      return null;
    }
  }

  /**
   * Core service: Find the best swap route
   * @param {Object} params - { fromToken, toToken, amount }
   * @returns {Object} Optimal route recommendation
   */
  async execute({ fromToken, toToken, amount, callerAddress }) {
    this.callCount++;
    console.log(`[SwapOptimizer] Call #${this.callCount}: ${fromToken} → ${toToken}, amount: ${amount}`);

    const results = { timestamp: Date.now(), fromToken, toToken, amount, routes: [], recommendation: null };

    // Fetch quotes in parallel from both sources
    const [onchainosQuote, uniswapRoute] = await Promise.allSettled([
      this.onchainos.getSwapQuote({ fromToken, toToken, amount }),
      this.uniswap.getSwapRoute({ tokenIn: fromToken, tokenOut: toToken, amountIn: amount }),
    ]);

    // Parse OnchainOS result
    if (onchainosQuote.status === "fulfilled" && onchainosQuote.value) {
      const q = onchainosQuote.value;
      results.routes.push({
        source: "OnchainOS DEX Aggregator",
        outputAmount: q.toTokenAmount || q.estimatedOutput || "0",
        priceImpact: q.priceImpact || "0",
        gasEstimate: q.estimateGasFee || "0",
        route: q.dexRouterList || [],
        score: 0,
      });
    }

    // Parse Uniswap result
    if (uniswapRoute.status === "fulfilled" && uniswapRoute.value) {
      const r = uniswapRoute.value;
      results.routes.push({
        source: "Uniswap V3",
        outputAmount: r.estimatedOutput || "0",
        priceImpact: r.priceImpact || "0",
        gasEstimate: r.gasEstimate || "0",
        route: r.route?.path || [],
        score: 0,
      });
    }

    // Score each route: higher output + lower gas = better
    for (const route of results.routes) {
      const output = parseFloat(route.outputAmount) || 0;
      const gas = parseFloat(route.gasEstimate) || 0;
      const impact = parseFloat(route.priceImpact) || 0;
      // Net value = output - gas cost equivalent - slippage from price impact
      route.score = output - gas * 0.0001 - output * (impact / 100);
    }

    // Sort by score descending
    results.routes.sort((a, b) => b.score - a.score);

    // Recommend best
    if (results.routes.length > 0) {
      const best = results.routes[0];
      results.recommendation = {
        source: best.source,
        outputAmount: best.outputAmount,
        priceImpact: best.priceImpact,
        gasEstimate: best.gasEstimate,
        advantage:
          results.routes.length > 1
            ? `${((best.score / results.routes[1].score - 1) * 100).toFixed(2)}% better than alternative`
            : "Only route available",
      };
    }

    // Record call on-chain
    if (this.serviceId && callerAddress) {
      try {
        await this.registry.recordServiceCall(this.serviceId, callerAddress);
      } catch (e) {
        console.warn(`[SwapOptimizer] Failed to record call:`, e.message);
      }
    }

    return results;
  }

  getStats() {
    return { name: this.name, serviceId: this.serviceId, totalCalls: this.callCount };
  }
}

export default SwapOptimizerAgent;
