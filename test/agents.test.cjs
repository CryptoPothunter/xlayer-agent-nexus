/**
 * Agent unit tests (mocha/chai, no network)
 *
 * Covers:
 *   1. AgentBrain – intent classification (12+ cases)
 *   2. AgentBrain – execution planning (dependency structure)
 *   3. SwapOptimizer – route comparison logic
 *   4. TokenScanner – risk scoring
 *   5. PriceAlert – alert creation and trigger
 */

const { expect } = require("chai");

// ── Lazy ESM imports (resolved once in before()) ──────────
let AgentBrain, SwapOptimizerAgent, TokenScannerAgent, PriceAlertAgent;

// ── Mock Factories ────────────────────────────────────────
// placeholder: filled in per-suite
function makeMockOnchainos(overrides = {}) {
  return {
    createPaymentRequest: (p) => ({ type: "payment_request", ...p }),
    executePayment: (p) => ({ type: "raw_tx", ...p }),
    verifyPaymentOnChain: async ({ txHash }) => ({
      verified: txHash === "0xgoodtx",
      txHash,
    }),
    getSwapQuote: async ({ fromToken, toToken, amount }) => ({
      toTokenAmount: "995",
      priceImpact: "0.3",
      estimateGasFee: "0.5",
      dexRouterList: ["routerA"],
    }),
    scanToken: async (_addr) => ({
      isHoneypot: false,
      isOpenSource: true,
      holderCount: 500,
      ownerChangeBalance: false,
      canTakeBackOwnership: false,
      transferPausable: false,
    }),
    scanContract: async (_addr) => ({
      isProxy: false,
      selfDestruct: false,
    }),
    getTokenPrice: async (_addr) => ({ price: "1.25" }),
    getTransactionHistory: async () => [],
    ...overrides,
  };
}

function makeMockUniswap(overrides = {}) {
  return {
    getSwapRoute: async ({ tokenIn, tokenOut, amountIn }) => ({
      estimatedOutput: "990",
      priceImpact: "0.5",
      gasEstimate: "1.2",
      route: { path: [tokenIn, tokenOut] },
    }),
    ...overrides,
  };
}

function makeMockRegistry(overrides = {}) {
  return {
    registerService: async (p) => ({ serviceId: "svc_mock_1" }),
    recordServiceCall: async () => {},
    getAgentProfile: async () => ({
      reputationScore: 80,
      totalServicesProvided: 15,
      totalEarned: "1.5",
    }),
    ...overrides,
  };
}

const WALLET = "0x" + "a".repeat(40);

// ── ESM import helper ─────────────────────────────────────
before(async function () {
  this.timeout(10000);
  const brain = await import("../src/core/agent-brain.js");
  AgentBrain = brain.AgentBrain;
  const swap = await import("../src/agents/swap-optimizer.js");
  SwapOptimizerAgent = swap.SwapOptimizerAgent;
  const scan = await import("../src/agents/token-scanner.js");
  TokenScannerAgent = scan.TokenScannerAgent;
  const alert = await import("../src/agents/price-alert.js");
  PriceAlertAgent = alert.PriceAlertAgent;
});

// ═══════════════════════════════════════════════════════════
// 1. AgentBrain – Intent Classification
// ═══════════════════════════════════════════════════════════
describe("AgentBrain – Intent Classification", function () {
  let brain;

  beforeEach(function () {
    brain = new AgentBrain({
      onchainos: makeMockOnchainos(),
      uniswap: makeMockUniswap(),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });
  });

  it("classifies a simple swap intent", function () {
    const r = brain.classifyIntent("swap 100 USDT to ETH");
    expect(r.intent).to.equal("swap");
    expect(r.confidence).to.be.greaterThan(0.5);
  });

  it("classifies exchange as swap", function () {
    const r = brain.classifyIntent("exchange my ETH for USDC");
    expect(r.intent).to.equal("swap");
  });

  it("classifies security scan intent", function () {
    const r = brain.classifyIntent("scan token 0x1234567890abcdef1234567890abcdef12345678 for risks");
    expect(r.intent).to.equal("security_scan");
  });

  it("classifies balance check", function () {
    const r = brain.classifyIntent("show my balance");
    expect(r.intent).to.equal("check_balance");
  });

  it("classifies price check", function () {
    const r = brain.classifyIntent("what is the price of ETH");
    expect(r.intent).to.equal("price_check");
  });

  it("classifies set alert intent", function () {
    const r = brain.classifyIntent("set alert when ETH goes above 2000");
    expect(r.intent).to.equal("set_alert");
  });

  it("detects negation — don't swap", function () {
    const r = brain.classifyIntent("don't swap my tokens");
    expect(r.negated).to.equal(true);
  });

  it("detects negation — cancel the swap", function () {
    const r = brain.classifyIntent("cancel the swap");
    // negated flag should be true OR intent should be cancel
    expect(r.negated === true || r.intent === "cancel").to.equal(true);
  });

  it("classifies Chinese swap intent (兑换)", function () {
    const r = brain.classifyIntent("我想兑换100 USDT");
    expect(r.intent).to.equal("swap");
  });

  it("classifies Chinese balance intent (查余额)", function () {
    const r = brain.classifyIntent("查余额");
    expect(r.intent).to.equal("check_balance");
  });

  it("classifies Chinese negation (不要兑换)", function () {
    const r = brain.classifyIntent("不要兑换");
    expect(r.negated).to.equal(true);
  });

  it("handles fuzzy typo (swpa -> swap)", function () {
    const r = brain.classifyIntent("swpa 50 USDT to ETH");
    expect(r.intent).to.equal("swap");
    expect(r.confidence).to.be.greaterThan(0);
  });

  it("returns unknown for gibberish", function () {
    const r = brain.classifyIntent("xyzzy plugh abracadabra");
    expect(r.intent).to.equal("unknown");
    expect(r.confidence).to.equal(0);
  });

  it("extracts token entities", function () {
    const r = brain.classifyIntent("swap 100 USDT to ETH");
    expect(r.entities.tokens).to.include("USDT");
    expect(r.entities.tokens).to.include("ETH");
    expect(r.entities.amount).to.equal("100");
  });

  it("extracts address entities", function () {
    const r = brain.classifyIntent("scan 0x1234567890abcdef1234567890abcdef12345678");
    expect(r.entities.address).to.equal("0x1234567890abcdef1234567890abcdef12345678");
  });
});

// ═══════════════════════════════════════════════════════════
// 2. AgentBrain – Execution Planning
// ═══════════════════════════════════════════════════════════
describe("AgentBrain – Execution Planning", function () {
  let brain;

  beforeEach(function () {
    brain = new AgentBrain({
      onchainos: makeMockOnchainos(),
      uniswap: makeMockUniswap(),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });
  });

  it("swap plan has correct dependency chain", async function () {
    const intent = brain.classifyIntent("swap 100 USDT to ETH");
    const plan = await brain.createPlan(intent);

    expect(plan.steps.length).to.be.greaterThanOrEqual(4);

    // The quote steps should depend on the scan step
    const quoteOs = plan.steps.find((s) => s.id === "swap_quote_os");
    const quoteUni = plan.steps.find((s) => s.id === "swap_quote_uni");
    expect(quoteOs).to.exist;
    expect(quoteUni).to.exist;
    expect(quoteOs.dependsOn).to.include("swap_scan");
    expect(quoteUni.dependsOn).to.include("swap_scan");

    // The compare step depends on both quotes (via pricing)
    const compare = plan.steps.find((s) => s.id === "swap_compare");
    expect(compare).to.exist;
    expect(compare.dependsOn).to.include("swap_pricing");

    // Exec depends on compare
    const exec = plan.steps.find((s) => s.id === "swap_exec");
    expect(exec).to.exist;
    expect(exec.dependsOn).to.include("swap_compare");
  });

  it("security_scan plan runs token + contract scans in parallel", async function () {
    const intent = brain.classifyIntent("scan token 0x1234567890abcdef1234567890abcdef12345678");
    const plan = await brain.createPlan(intent);

    const tokenScan = plan.steps.find((s) => s.id === "sec_token");
    const contractScan = plan.steps.find((s) => s.id === "sec_contract");
    const report = plan.steps.find((s) => s.id === "sec_report");

    expect(tokenScan.dependsOn).to.deep.equal([]);
    expect(contractScan.dependsOn).to.deep.equal([]);
    expect(report.dependsOn).to.include("sec_token");
    expect(report.dependsOn).to.include("sec_contract");
  });

  it("check_balance plan has single step with no deps", async function () {
    const intent = brain.classifyIntent("show balance");
    const plan = await brain.createPlan(intent);
    expect(plan.steps).to.have.lengthOf(1);
    expect(plan.steps[0].dependsOn).to.deep.equal([]);
  });

  it("estimatedTime increases with dependency depth", async function () {
    const swapIntent = brain.classifyIntent("swap 100 USDT to ETH");
    const balIntent = brain.classifyIntent("show balance");
    const swapPlan = await brain.createPlan(swapIntent);
    const balPlan = await brain.createPlan(balIntent);
    expect(swapPlan.estimatedTime).to.be.greaterThan(balPlan.estimatedTime);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. SwapOptimizer – Route Comparison
// ═══════════════════════════════════════════════════════════
describe("SwapOptimizer – Route Comparison", function () {
  it("picks OnchainOS when it has higher output", async function () {
    const agent = new SwapOptimizerAgent({
      onchainos: makeMockOnchainos({
        getSwapQuote: async () => ({
          toTokenAmount: "1000",
          priceImpact: "0.1",
          estimateGasFee: "0.5",
          dexRouterList: ["A"],
        }),
      }),
      uniswap: makeMockUniswap({
        getSwapRoute: async () => ({
          estimatedOutput: "950",
          priceImpact: "0.5",
          gasEstimate: "1.0",
          route: { path: ["X", "Y"] },
        }),
      }),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      fromToken: "USDT",
      toToken: "ETH",
      amount: "1000",
      paymentVerified: true,
    });

    expect(result.status).to.equal("paid");
    expect(result.routes).to.have.lengthOf(2);
    expect(result.recommendation.source).to.equal("OnchainOS DEX Aggregator");
  });

  it("picks Uniswap when OnchainOS fails", async function () {
    const agent = new SwapOptimizerAgent({
      onchainos: makeMockOnchainos({
        getSwapQuote: async () => { throw new Error("API down"); },
      }),
      uniswap: makeMockUniswap(),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      fromToken: "USDT",
      toToken: "ETH",
      amount: "1000",
      paymentVerified: true,
    });

    expect(result.routes).to.have.lengthOf(1);
    expect(result.recommendation.source).to.equal("Uniswap V3");
  });

  it("returns pending_payment when no payment provided", async function () {
    const agent = new SwapOptimizerAgent({
      onchainos: makeMockOnchainos(),
      uniswap: makeMockUniswap(),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      fromToken: "USDT",
      toToken: "ETH",
      amount: "1000",
    });

    expect(result.status).to.equal("pending_payment");
    expect(result.payment).to.exist;
    expect(result.payment.request).to.exist;
  });

  it("returns payment_failed for bad txHash", async function () {
    const agent = new SwapOptimizerAgent({
      onchainos: makeMockOnchainos(),
      uniswap: makeMockUniswap(),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      fromToken: "USDT",
      toToken: "ETH",
      amount: "1000",
      paymentTxHash: "0xbadtx",
    });

    expect(result.status).to.equal("payment_failed");
  });

  it("scores routes: higher output - gas - impact = higher score", async function () {
    const agent = new SwapOptimizerAgent({
      onchainos: makeMockOnchainos({
        getSwapQuote: async () => ({
          toTokenAmount: "1000",
          priceImpact: "5",   // 5% impact (bad)
          estimateGasFee: "0.5",
          dexRouterList: [],
        }),
      }),
      uniswap: makeMockUniswap({
        getSwapRoute: async () => ({
          estimatedOutput: "980",
          priceImpact: "0.1",  // 0.1% impact (good)
          gasEstimate: "0.5",
          route: { path: [] },
        }),
      }),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      fromToken: "USDT",
      toToken: "ETH",
      amount: "1000",
      paymentVerified: true,
    });

    // Uniswap should win despite lower raw output because OnchainOS has 5% price impact
    expect(result.recommendation.source).to.equal("Uniswap V3");
  });
});

// ═══════════════════════════════════════════════════════════
// 4. TokenScanner – Risk Scoring
// ═══════════════════════════════════════════════════════════
describe("TokenScanner – Risk Scoring", function () {
  it("scores a safe token as low risk", async function () {
    const agent = new TokenScannerAgent({
      onchainos: makeMockOnchainos(),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      tokenAddress: "0x" + "1".repeat(40),
      paymentVerified: true,
    });

    expect(result.status).to.equal("paid");
    expect(result.riskLevel).to.equal("low");
    expect(result.riskScore).to.equal(0);
    expect(result.warnings).to.have.lengthOf(0);
  });

  it("scores a honeypot token as critical", async function () {
    const agent = new TokenScannerAgent({
      onchainos: makeMockOnchainos({
        scanToken: async () => ({
          isHoneypot: true,
          isOpenSource: false,
          holderCount: 10,
          ownerChangeBalance: true,
          canTakeBackOwnership: true,
          transferPausable: true,
        }),
        scanContract: async () => ({
          isProxy: true,
          selfDestruct: true,
        }),
      }),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      tokenAddress: "0x" + "b".repeat(40),
      paymentVerified: true,
    });

    expect(result.riskLevel).to.equal("critical");
    expect(result.riskScore).to.be.greaterThanOrEqual(60);
    expect(result.warnings.length).to.be.greaterThan(3);
    expect(result.warnings.join(" ")).to.include("honeypot");
  });

  it("scores medium risk for partial warnings", async function () {
    const agent = new TokenScannerAgent({
      onchainos: makeMockOnchainos({
        scanToken: async () => ({
          isHoneypot: false,
          isOpenSource: false,       // +15
          holderCount: 30,           // +10  (< 50)
          ownerChangeBalance: false,
          canTakeBackOwnership: false,
          transferPausable: false,
        }),
        scanContract: async () => ({
          isProxy: true,             // +5
          selfDestruct: false,
        }),
      }),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      tokenAddress: "0x" + "c".repeat(40),
      paymentVerified: true,
    });

    // 15 + 10 + 5 = 30 => "high" (>= 30)
    expect(result.riskLevel).to.equal("high");
    expect(result.riskScore).to.equal(30);
  });

  it("returns pending_payment without payment", async function () {
    const agent = new TokenScannerAgent({
      onchainos: makeMockOnchainos(),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const result = await agent.execute({
      tokenAddress: "0x" + "d".repeat(40),
    });

    expect(result.status).to.equal("pending_payment");
  });

  it("caches results for the same address", async function () {
    let scanCount = 0;
    const agent = new TokenScannerAgent({
      onchainos: makeMockOnchainos({
        scanToken: async () => { scanCount++; return { isHoneypot: false, isOpenSource: true, holderCount: 100, ownerChangeBalance: false, canTakeBackOwnership: false, transferPausable: false }; },
        scanContract: async () => { scanCount++; return { isProxy: false, selfDestruct: false }; },
      }),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });

    const addr = "0x" + "e".repeat(40);
    await agent.execute({ tokenAddress: addr, paymentVerified: true });
    const countAfterFirst = scanCount;

    await agent.execute({ tokenAddress: addr, paymentVerified: true });
    // Second call should use cache, no additional scans
    expect(scanCount).to.equal(countAfterFirst);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. PriceAlert – Alert Creation and Trigger
// ═══════════════════════════════════════════════════════════
describe("PriceAlert – Alert Creation & Trigger", function () {
  let agent;
  let currentPrice;

  beforeEach(function () {
    currentPrice = "1.25";
    agent = new PriceAlertAgent({
      onchainos: makeMockOnchainos({
        getTokenPrice: async () => ({ price: currentPrice }),
      }),
      registry: makeMockRegistry(),
      walletAddress: WALLET,
    });
  });

  afterEach(function () {
    agent.stopMonitoring();
  });

  it("creates an alert with paid status when paymentVerified", async function () {
    const result = await agent.execute({
      tokenAddress: "0x" + "1".repeat(40),
      targetPrice: "2.00",
      direction: "above",
      paymentVerified: true,
    });

    expect(result.status).to.equal("paid");
    expect(result.alertId).to.be.a("string");
    expect(result.direction).to.equal("above");
    expect(result.currentPrice).to.equal("1.25");
  });

  it("returns pending_payment without payment", async function () {
    const result = await agent.execute({
      tokenAddress: "0x" + "1".repeat(40),
      targetPrice: "2.00",
    });

    expect(result.status).to.equal("pending_payment");
  });

  it("triggers alert when price crosses above target", async function () {
    await agent.execute({
      tokenAddress: "0x" + "1".repeat(40),
      targetPrice: "1.50",
      direction: "above",
      paymentVerified: true,
    });

    // Price is 1.25 — not triggered yet
    let triggered = await agent.checkAlerts();
    expect(triggered).to.have.lengthOf(0);

    // Price rises above target
    currentPrice = "1.60";
    triggered = await agent.checkAlerts();
    expect(triggered).to.have.lengthOf(1);
    expect(triggered[0].triggeredPrice).to.equal(1.6);
  });

  it("triggers alert when price drops below target", async function () {
    await agent.execute({
      tokenAddress: "0x" + "2".repeat(40),
      targetPrice: "1.00",
      direction: "below",
      paymentVerified: true,
    });

    // Price is 1.25 — not triggered
    let triggered = await agent.checkAlerts();
    expect(triggered).to.have.lengthOf(0);

    // Price drops
    currentPrice = "0.90";
    triggered = await agent.checkAlerts();
    expect(triggered).to.have.lengthOf(1);
  });

  it("does not re-trigger an already triggered alert", async function () {
    await agent.execute({
      tokenAddress: "0x" + "3".repeat(40),
      targetPrice: "1.00",
      direction: "below",
      paymentVerified: true,
    });

    currentPrice = "0.80";
    await agent.checkAlerts();
    const second = await agent.checkAlerts();
    expect(second).to.have.lengthOf(0);
  });

  it("cancels an alert", async function () {
    const result = await agent.execute({
      tokenAddress: "0x" + "4".repeat(40),
      targetPrice: "5.00",
      direction: "above",
      paymentVerified: true,
    });

    const cancel = agent.cancelAlert(result.alertId);
    expect(cancel.success).to.equal(true);

    const active = agent.getActiveAlerts();
    expect(active).to.have.lengthOf(0);
  });

  it("cancel returns error for unknown alert", function () {
    const cancel = agent.cancelAlert("nonexistent_id");
    expect(cancel.success).to.equal(false);
  });

  it("executes callback on trigger", async function () {
    let callbackData = null;
    await agent.execute({
      tokenAddress: "0x" + "5".repeat(40),
      targetPrice: "1.00",
      direction: "below",
      callback: async (data) => { callbackData = data; },
      paymentVerified: true,
    });

    currentPrice = "0.50";
    await agent.checkAlerts();
    expect(callbackData).to.not.be.null;
    expect(callbackData.triggeredPrice).to.equal(0.5);
  });
});
