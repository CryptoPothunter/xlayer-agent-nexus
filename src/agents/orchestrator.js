/**
 * Orchestrator Agent - The main agent that coordinates everything
 * Handles user interaction, delegates to service agents, and manages
 * the marketplace lifecycle.
 */
import { ethers } from "ethers";
import { OnchainOSClient } from "../core/onchainos-client.js";
import { UniswapClient, XLAYER_TOKENS } from "../core/uniswap-client.js";
import { RegistryClient } from "../core/registry-client.js";
import { AgentBrain } from "../core/agent-brain.js";
import { SwapOptimizerAgent } from "./swap-optimizer.js";
import { TokenScannerAgent } from "./token-scanner.js";
import { PriceAlertAgent } from "./price-alert.js";

export class Orchestrator {
  constructor(config) {
    this.config = config;
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;

    // Core modules
    this.onchainos = null;
    this.uniswap = null;
    this.registry = null;
    this.brain = null;

    // Service agents
    this.swapOptimizer = null;
    this.tokenScanner = null;
    this.priceAlert = null;

    this.initialized = false;
    this.stats = { totalActions: 0, startTime: Date.now() };
  }

  // ─── Initialization ────────────────────────────────────

  async initialize() {
    console.log("═══════════════════════════════════════════");
    console.log("  X Layer Agent Nexus - Initializing...");
    console.log("═══════════════════════════════════════════\n");

    // Setup provider and signer
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl || "https://rpc.xlayer.tech");
    if (this.config.privateKey) {
      this.signer = new ethers.Wallet(this.config.privateKey, this.provider);
      this.walletAddress = this.signer.address;
      console.log(`[Init] Wallet: ${this.walletAddress}`);
    }

    // Initialize OnchainOS client
    this.onchainos = new OnchainOSClient({
      apiKey: this.config.onchainosApiKey,
      projectId: this.config.onchainosProjectId,
      walletAddress: this.walletAddress,
    });
    console.log("[Init] OnchainOS client ready");

    // Initialize Uniswap client
    this.uniswap = new UniswapClient({
      rpcUrl: this.config.rpcUrl,
      walletAddress: this.walletAddress,
    });
    console.log("[Init] Uniswap client ready");

    // Initialize Registry client
    if (this.config.registryAddress) {
      this.registry = new RegistryClient({
        provider: this.provider,
        signer: this.signer,
        contractAddress: this.config.registryAddress,
      });
      console.log(`[Init] Registry at ${this.config.registryAddress}`);
    }

    // Initialize Agent Brain
    this.brain = new AgentBrain({
      onchainos: this.onchainos,
      uniswap: this.uniswap,
      registry: this.registry,
      walletAddress: this.walletAddress,
    });
    console.log("[Init] Agent Brain ready");

    // Initialize service agents
    this.swapOptimizer = new SwapOptimizerAgent({
      onchainos: this.onchainos,
      uniswap: this.uniswap,
      registry: this.registry,
      walletAddress: this.walletAddress,
    });

    this.tokenScanner = new TokenScannerAgent({
      onchainos: this.onchainos,
      registry: this.registry,
      walletAddress: this.walletAddress,
    });

    this.priceAlert = new PriceAlertAgent({
      onchainos: this.onchainos,
      registry: this.registry,
      walletAddress: this.walletAddress,
    });

    console.log("[Init] Service agents ready");
    this.initialized = true;

    console.log("\n═══════════════════════════════════════════");
    console.log("  Agent Nexus READY");
    console.log("═══════════════════════════════════════════\n");

    return this;
  }

  // ─── Agent Registration ────────────────────────────────

  async registerOnMarketplace() {
    if (!this.registry) {
      console.warn("[Orchestrator] No registry configured, skipping registration");
      return;
    }

    console.log("\n[Marketplace] Registering agent and services...");

    // Register the agent
    try {
      await this.registry.registerAgent(this.config.agentName || "NexusOrchestrator");
      console.log("[Marketplace] Agent profile created");
    } catch (e) {
      console.log("[Marketplace] Agent may already be registered:", e.message);
    }

    // Register all services
    const results = await Promise.allSettled([
      this.swapOptimizer.register(),
      this.tokenScanner.register(),
      this.priceAlert.register(),
    ]);

    const registered = results.filter((r) => r.status === "fulfilled" && r.value).length;
    console.log(`[Marketplace] ${registered}/3 services registered successfully\n`);

    return registered;
  }

  // ─── Message Processing ────────────────────────────────

  /**
   * Process a natural language message and execute the appropriate actions
   */
  async processMessage(input) {
    this.stats.totalActions++;

    // Step 1: Classify intent
    const parsed = this.brain.classifyIntent(input);
    console.log(`[Brain] Intent: ${parsed.intent} (confidence: ${parsed.confidence.toFixed(2)})`);

    // Step 2: Plan execution
    const plan = await this.brain.planExecution(parsed);
    console.log(`[Brain] Plan: ${plan.steps.length} steps`);

    // Step 3: Execute plan
    const result = await this._executePlan(plan, parsed);

    return result;
  }

  // ─── Plan Execution ────────────────────────────────────

  async _executePlan(plan, parsed) {
    const results = [];

    for (const step of plan.steps) {
      console.log(`  → ${step.action} [${step.module}]${step.reason ? ` (${step.reason})` : ""}`);

      try {
        const stepResult = await this._executeStep(step, parsed, results);
        results.push({ step: step.action, success: true, data: stepResult });
      } catch (e) {
        console.error(`  ✗ ${step.action} failed:`, e.message);
        results.push({ step: step.action, success: false, error: e.message });
      }
    }

    // Generate summary
    const summary = this._generateSummary(plan, results);
    return { plan, results, summary };
  }

  async _executeStep(step, parsed, previousResults) {
    const entities = parsed.entities || {};

    switch (step.action) {
      // ── Wallet ──
      case "get_balances":
        return await this.onchainos.getBalances();

      // ── DEX ──
      case "get_quote":
        return await this.onchainos.getSwapQuote({
          fromToken: this._resolveToken(entities.token),
          toToken: this._resolveToken(entities.toToken),
          amount: entities.amount || "1000000", // Default 1 USDT
        });

      case "get_route":
        return await this.uniswap.getSwapRoute({
          tokenIn: this._resolveToken(entities.token),
          tokenOut: this._resolveToken(entities.toToken),
          amountIn: entities.amount || "1000000",
        });

      case "compare_routes": {
        const onchainosResult = previousResults.find((r) => r.step === "get_quote");
        const uniswapResult = previousResults.find((r) => r.step === "get_route");
        return this._compareRoutes(onchainosResult?.data, uniswapResult?.data);
      }

      case "execute_swap": {
        const comparison = previousResults.find((r) => r.step === "compare_routes");
        return { action: "swap_ready", bestRoute: comparison?.data?.best, status: "awaiting_confirmation" };
      }

      // ── Security ──
      case "security_scan":
      case "token_scan": {
        const tokenAddr = entities.address || this._resolveToken(entities.token);
        if (!tokenAddr) return { error: "No token address provided" };
        return await this.tokenScanner.execute({ tokenAddress: tokenAddr, callerAddress: this.walletAddress });
      }

      case "contract_scan": {
        const addr = entities.address || this._resolveToken(entities.token);
        if (!addr) return { error: "No address provided" };
        return await this.onchainos.scanContract(addr);
      }

      case "risk_report": {
        const scanResult = previousResults.find((r) => r.step === "token_scan" || r.step === "security_scan");
        return { type: "risk_report", scan: scanResult?.data, timestamp: Date.now() };
      }

      // ── Market ──
      case "get_price":
        return await this.onchainos.getTokenPrice(
          entities.address || this._resolveToken(entities.token)
        );

      case "get_defi_positions":
        return await this.onchainos.getDeFiPositions();

      // ── Registry ──
      case "list_active_services":
      case "list_services":
      case "discover_services":
      case "find_yield_services":
        if (this.registry) {
          return await this.registry.getAllActiveServices();
        }
        return { message: "Registry not configured" };

      case "get_agent_profile":
        if (this.registry) {
          return await this.registry.getAgentProfile(this.walletAddress);
        }
        return { message: "Registry not configured" };

      // ── Brain ──
      case "evaluate_providers":
      case "compare_options":
      case "recommend_service":
      case "create_earning_plan":
        return { action: step.action, status: "analysis_complete", timestamp: Date.now() };

      // ── System ──
      case "show_help":
        return this._getHelpText();

      default:
        return { action: step.action, status: "not_implemented" };
    }
  }

  // ─── Helpers ───────────────────────────────────────────

  _resolveToken(symbol) {
    if (!symbol) return null;
    const upper = symbol.toUpperCase();
    return XLAYER_TOKENS[upper] || symbol;
  }

  _compareRoutes(onchainosData, uniswapData) {
    const routes = [];

    if (onchainosData) {
      routes.push({ source: "OnchainOS", data: onchainosData, output: parseFloat(onchainosData?.toTokenAmount || 0) });
    }
    if (uniswapData) {
      routes.push({ source: "Uniswap", data: uniswapData, output: parseFloat(uniswapData?.estimatedOutput || 0) });
    }

    routes.sort((a, b) => b.output - a.output);

    return {
      best: routes[0] || null,
      all: routes,
      comparison: routes.length > 1
        ? `${routes[0].source} gives ${((routes[0].output / routes[1].output - 1) * 100).toFixed(2)}% more output`
        : "Single route available",
    };
  }

  _generateSummary(plan, results) {
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      intent: plan.intent,
      totalSteps: plan.steps.length,
      succeeded,
      failed,
      timestamp: Date.now(),
    };
  }

  _getHelpText() {
    return {
      title: "X Layer Agent Nexus",
      description: "Autonomous Agent-to-Agent Service Marketplace on X Layer",
      commands: [
        { example: "swap 100 USDT to ETH", description: "Find optimal swap route" },
        { example: "scan token 0x...", description: "Security scan a token" },
        { example: "find services", description: "Discover marketplace services" },
        { example: "check balance", description: "View wallet balances" },
        { example: "price OKB", description: "Check token price" },
        { example: "earn with 100 USDT", description: "Find earning opportunities" },
        { example: "status", description: "Agent status dashboard" },
      ],
      modules: [
        "OnchainOS: Wallet, DEX Aggregator, Market, Security",
        "Uniswap: Trading, Pay-Any-Token",
        "Registry: Service marketplace on X Layer",
      ],
    };
  }

  // ─── Status ────────────────────────────────────────────

  getStatus() {
    return {
      agent: this.config.agentName || "NexusOrchestrator",
      wallet: this.walletAddress,
      initialized: this.initialized,
      uptime: Date.now() - this.stats.startTime,
      totalActions: this.stats.totalActions,
      services: {
        swapOptimizer: this.swapOptimizer?.getStats(),
        tokenScanner: this.tokenScanner?.getStats(),
        priceAlert: this.priceAlert?.getStats(),
      },
      modules: {
        onchainos: !!this.onchainos,
        uniswap: !!this.uniswap,
        registry: !!this.registry,
        brain: !!this.brain,
      },
    };
  }

  async shutdown() {
    console.log("\n[Orchestrator] Shutting down...");
    if (this.priceAlert) this.priceAlert.stopMonitoring();
    console.log("[Orchestrator] Goodbye.\n");
  }
}

export default Orchestrator;
