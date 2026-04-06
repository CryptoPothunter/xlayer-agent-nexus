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
   *
   * Payment flow:
   *   1. Create payment request (returned to caller)
   *   2. Caller signs and broadcasts the USDT transfer tx
   *   3. Caller calls executeWithPayment(txHash, params) to verify & deliver
   *
   * @param {Object} params - { fromToken, toToken, amount, callerAddress, paymentTxHash }
   * @returns {Object} Optimal route recommendation with payment details
   */
  async execute({ fromToken, toToken, amount, callerAddress, paymentTxHash, paymentVerified = false }) {
    this.callCount++;
    console.log(`[SwapOptimizer] Call #${this.callCount}: ${fromToken} → ${toToken}, amount: ${amount}`);

    const PRICE_PER_CALL = "0.01";

    // If caller already verified payment (e.g. agent-server did x402 header check),
    // skip redundant payment logic and go straight to service execution.
    let isPaymentConfirmed = paymentVerified;

    // If not pre-verified but a txHash was supplied, verify on-chain ourselves.
    if (!isPaymentConfirmed && paymentTxHash) {
      try {
        const verification = await this.onchainos.verifyPaymentOnChain({
          txHash: paymentTxHash,
          expectedTo: this.walletAddress,
          expectedAmount: PRICE_PER_CALL,
        });
        isPaymentConfirmed = !!verification.verified;
        if (!isPaymentConfirmed) {
          return {
            timestamp: Date.now(),
            status: "payment_failed",
            message: "Payment verification failed. Service results withheld.",
            paymentVerification: verification,
          };
        }
      } catch (err) {
        return {
          timestamp: Date.now(),
          status: "payment_failed",
          message: `Payment verification error: ${err.message}`,
        };
      }
    }

    // If still no confirmed payment, return a pending_payment response with instructions.
    if (!isPaymentConfirmed) {
      const paymentRequest = this.onchainos.createPaymentRequest({
        amount: PRICE_PER_CALL,
        recipient: this.walletAddress,
        memo: `SwapOptimizer: ${fromToken} -> ${toToken}`,
        serviceId: this.serviceId,
      });
      const paymentTx = callerAddress
        ? this.onchainos.executePayment({ from: callerAddress, to: this.walletAddress, amount: PRICE_PER_CALL })
        : null;
      return {
        timestamp: Date.now(),
        status: "pending_payment",
        message: "Payment required before service execution. Submit paymentTxHash or use x402 header.",
        payment: { request: paymentRequest, transaction: paymentTx },
      };
    }

    // ── Payment confirmed — execute the service (route optimization) ──

    const results = {
      timestamp: Date.now(),
      status: "paid",
      fromToken,
      toToken,
      amount,
      routes: [],
      recommendation: null,
    };

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

    // Record call on-chain (payment already confirmed at this point)
    if (this.serviceId && callerAddress) {
      try {
        await this.registry.recordServiceCall(this.serviceId, callerAddress);
        results.onChainRecord = { recorded: true };
      } catch (e) {
        console.warn(`[SwapOptimizer] Failed to record call:`, e.message);
        results.onChainRecord = { recorded: false, error: e.message };
      }
    }

    return results;
  }

  getStats() {
    return { name: this.name, serviceId: this.serviceId, totalCalls: this.callCount };
  }
}

export default SwapOptimizerAgent;
