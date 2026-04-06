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
      secretKey: this.config.onchainosSecretKey,
      passphrase: this.config.onchainosPassphrase,
      projectId: this.config.onchainosProjectId,
      walletAddress: this.walletAddress,
    });
    console.log("[Init] OnchainOS client ready");

    // Initialize Uniswap client
    this.uniswap = new UniswapClient({
      rpcUrl: this.config.rpcUrl,
      walletAddress: this.walletAddress,
      onchainosApiKey: this.config.onchainosApiKey,
      onchainosSecretKey: this.config.onchainosSecretKey,
      onchainosPassphrase: this.config.onchainosPassphrase,
      onchainosProjectId: this.config.onchainosProjectId,
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
      case "check_balances":
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
        const securityResult = previousResults.find((r) => r.step === "security_scan");
        const comparison = this._compareRoutes(onchainosResult?.data, uniswapResult?.data);

        // Attach security context so downstream steps can use it
        if (securityResult?.success && securityResult.data) {
          const riskLevel = securityResult.data?.riskLevel || securityResult.data?.securityInfo?.riskLevel || "unknown";
          comparison.securityCheck = {
            scanned: true,
            riskLevel,
            safe: riskLevel !== "critical" && riskLevel !== "high",
          };
          if (!comparison.securityCheck.safe) {
            comparison.warning = `Token flagged as ${riskLevel} risk — proceed with extreme caution`;
          }
        } else {
          comparison.securityCheck = { scanned: false, riskLevel: "unknown", safe: null };
        }
        return comparison;
      }

      case "execute_swap": {
        // Check if a security scan flagged critical risks — abort if so
        const secScan = previousResults.find((r) => r.step === "security_scan");
        if (secScan?.success && secScan.data) {
          const scanData = secScan.data;
          const riskLevel = scanData?.riskLevel || scanData?.securityInfo?.riskLevel || "";
          if (riskLevel === "critical" || riskLevel === "high") {
            return {
              action: "swap_aborted",
              reason: `Security scan returned risk level: ${riskLevel}`,
              scanDetails: scanData,
              status: "rejected",
            };
          }
        }

        const comparison = previousResults.find((r) => r.step === "compare_routes");
        const bestRoute = comparison?.data?.best;
        const fromToken = this._resolveToken(entities.token);
        const toToken = this._resolveToken(entities.toToken);
        const amount = entities.amount || "1000000";

        // Call OnchainOS getSwapTransaction to get real calldata
        const txData = await this.onchainos.getSwapTransaction({
          fromToken,
          toToken,
          amount,
          slippage: "0.5",
          userWalletAddress: this.walletAddress,
        });

        if (!txData) {
          return {
            action: "execute_swap",
            status: "failed",
            error: "Failed to build swap transaction via OnchainOS",
            bestRoute: bestRoute || null,
          };
        }

        return {
          action: "execute_swap",
          status: "ready_to_sign",
          bestRoute: bestRoute || null,
          transaction: {
            to: txData.tx?.to || txData.to,
            data: txData.tx?.data || txData.data,
            value: txData.tx?.value || txData.value || "0",
            gasLimit: txData.tx?.gas || txData.tx?.gasLimit || txData.gasLimit,
            gasPrice: txData.tx?.gasPrice || txData.gasPrice,
            from: this.walletAddress,
          },
          routerResult: txData,
        };
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
        const tokenScanResult = previousResults.find((r) => r.step === "token_scan" || r.step === "security_scan");
        const contractScanResult = previousResults.find((r) => r.step === "contract_scan");
        return this._buildRiskReport(tokenScanResult, contractScanResult);
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
      case "evaluate_providers": {
        // Evaluate providers from previously discovered services
        const servicesResult = previousResults.find(
          (r) => r.step === "list_active_services" || r.step === "list_services" || r.step === "discover_services"
        );
        return this._evaluateProviders(servicesResult?.data);
      }

      case "compare_options": {
        // Compare options from previously discovered services
        const discoveredServices = previousResults.find(
          (r) => r.step === "discover_services" || r.step === "list_active_services" || r.step === "list_services"
        );
        return this._compareOptions(discoveredServices?.data, entities);
      }

      case "recommend_service": {
        // Recommend from evaluated/compared providers
        const evaluated = previousResults.find((r) => r.step === "evaluate_providers");
        const compared = previousResults.find((r) => r.step === "compare_options");
        const source = evaluated?.data || compared?.data;
        return this._recommendService(source, entities);
      }

      case "create_earning_plan": {
        const balancesResult = previousResults.find(
          (r) => r.step === "check_balances" || r.step === "get_balances"
        );
        const defiResult = previousResults.find((r) => r.step === "get_defi_positions");
        const yieldServices = previousResults.find((r) => r.step === "find_yield_services");
        return this._createEarningPlan(balancesResult?.data, defiResult?.data, yieldServices?.data, entities);
      }

      case "execute_optimal": {
        const comparedOptions = previousResults.find((r) => r.step === "compare_options");
        const best = comparedOptions?.data?.ranked?.[0] || null;
        return {
          action: "execute_optimal",
          status: best ? "ready" : "no_options_found",
          selectedService: best,
          timestamp: Date.now(),
        };
      }

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

  _buildRiskReport(tokenScanResult, contractScanResult) {
    const report = {
      type: "risk_report",
      timestamp: Date.now(),
      overallRisk: "unknown",
      tokenScan: null,
      contractScan: null,
      flags: [],
      recommendation: "",
    };

    // Process token scan
    if (tokenScanResult?.success && tokenScanResult.data) {
      const scan = tokenScanResult.data;
      report.tokenScan = {
        riskLevel: scan.riskLevel || scan.securityInfo?.riskLevel || "unknown",
        isHoneypot: scan.isHoneypot || scan.securityInfo?.isHoneypot || false,
        isMintable: scan.isMintable || scan.securityInfo?.isMintable || false,
        hasProxy: scan.hasProxy || scan.securityInfo?.hasProxy || false,
        buyTax: scan.buyTax || scan.tradingInfo?.buyTax || "0",
        sellTax: scan.sellTax || scan.tradingInfo?.sellTax || "0",
      };
      if (report.tokenScan.isHoneypot) report.flags.push("HONEYPOT_DETECTED");
      if (report.tokenScan.isMintable) report.flags.push("MINTABLE_TOKEN");
      if (report.tokenScan.hasProxy) report.flags.push("PROXY_CONTRACT");
      if (parseFloat(report.tokenScan.sellTax) > 10) report.flags.push("HIGH_SELL_TAX");
      if (parseFloat(report.tokenScan.buyTax) > 10) report.flags.push("HIGH_BUY_TAX");
    } else if (tokenScanResult && !tokenScanResult.success) {
      report.flags.push("TOKEN_SCAN_FAILED");
    }

    // Process contract scan
    if (contractScanResult?.success && contractScanResult.data) {
      report.contractScan = contractScanResult.data;
      const isRisky = contractScanResult.data.isOpen === false || contractScanResult.data.riskLevel === "high";
      if (isRisky) report.flags.push("CONTRACT_RISK_DETECTED");
    } else if (contractScanResult && !contractScanResult.success) {
      report.flags.push("CONTRACT_SCAN_FAILED");
    }

    // Determine overall risk
    if (report.flags.includes("HONEYPOT_DETECTED")) {
      report.overallRisk = "critical";
      report.recommendation = "DO NOT interact with this token — honeypot detected.";
    } else if (report.flags.length >= 3) {
      report.overallRisk = "high";
      report.recommendation = "Multiple risk factors found. Avoid unless you fully understand the risks.";
    } else if (report.flags.length >= 1) {
      report.overallRisk = "medium";
      report.recommendation = "Some risk factors detected. Proceed with caution and use small amounts.";
    } else {
      report.overallRisk = "low";
      report.recommendation = "No major risks detected. Standard precautions apply.";
    }

    return report;
  }

  _evaluateProviders(servicesData) {
    const services = Array.isArray(servicesData) ? servicesData : [];

    if (services.length === 0) {
      return {
        action: "evaluate_providers",
        status: "no_services_found",
        providers: [],
        timestamp: Date.now(),
      };
    }

    const evaluated = services.map((svc) => {
      const reputation = Number(svc.reputationScore || svc.reputation || 0);
      const callCount = Number(svc.totalCalls || svc.callCount || 0);
      const price = parseFloat(svc.pricePerCall || svc.price || 0);

      // Score: reputation weighted most, then activity, then price (lower is better)
      const score =
        reputation * 0.5 +
        Math.min(callCount / 10, 50) * 0.3 +
        (price > 0 ? Math.max(0, 50 - price * 100) : 25) * 0.2;

      return {
        serviceId: svc.serviceId || svc.id,
        name: svc.name || svc.serviceName || "Unknown",
        provider: svc.provider || svc.agentAddress,
        reputation,
        totalCalls: callCount,
        pricePerCall: price,
        score: Math.round(score * 100) / 100,
        trustLevel: reputation >= 80 ? "high" : reputation >= 50 ? "medium" : "low",
      };
    });

    evaluated.sort((a, b) => b.score - a.score);

    return {
      action: "evaluate_providers",
      status: "complete",
      providers: evaluated,
      totalEvaluated: evaluated.length,
      timestamp: Date.now(),
    };
  }

  _compareOptions(servicesData, entities) {
    const services = Array.isArray(servicesData) ? servicesData : [];

    if (services.length === 0) {
      return {
        action: "compare_options",
        status: "no_options",
        ranked: [],
        timestamp: Date.now(),
      };
    }

    // Rank services by a composite of price, reputation, and relevance
    const ranked = services
      .map((svc) => {
        const price = parseFloat(svc.pricePerCall || svc.price || 0);
        const reputation = Number(svc.reputationScore || svc.reputation || 0);
        const calls = Number(svc.totalCalls || svc.callCount || 0);

        // Value score: high reputation + low price + proven usage
        const valueScore =
          reputation * 0.4 +
          (price > 0 ? Math.max(0, 100 - price * 200) : 50) * 0.35 +
          Math.min(calls, 100) * 0.25;

        return {
          serviceId: svc.serviceId || svc.id,
          name: svc.name || svc.serviceName || "Unknown",
          provider: svc.provider || svc.agentAddress,
          price,
          reputation,
          usage: calls,
          valueScore: Math.round(valueScore * 100) / 100,
        };
      })
      .sort((a, b) => b.valueScore - a.valueScore);

    return {
      action: "compare_options",
      status: "complete",
      ranked,
      bestOption: ranked[0] || null,
      totalCompared: ranked.length,
      timestamp: Date.now(),
    };
  }

  _recommendService(evaluationData, entities) {
    const providers = evaluationData?.providers || evaluationData?.ranked || [];

    if (providers.length === 0) {
      return {
        action: "recommend_service",
        status: "no_recommendation",
        reason: "No providers available to evaluate",
        timestamp: Date.now(),
      };
    }

    // Pick the top-scored provider
    const best = providers[0];
    const runnerUp = providers[1] || null;

    return {
      action: "recommend_service",
      status: "complete",
      recommendation: {
        serviceId: best.serviceId,
        name: best.name,
        provider: best.provider,
        score: best.score || best.valueScore,
        trustLevel: best.trustLevel || (best.reputation >= 80 ? "high" : best.reputation >= 50 ? "medium" : "low"),
        pricePerCall: best.pricePerCall || best.price,
      },
      alternative: runnerUp
        ? { serviceId: runnerUp.serviceId, name: runnerUp.name, score: runnerUp.score || runnerUp.valueScore }
        : null,
      totalCandidates: providers.length,
      timestamp: Date.now(),
    };
  }

  _createEarningPlan(balances, defiPositions, yieldServices, entities) {
    const plan = {
      action: "create_earning_plan",
      status: "complete",
      timestamp: Date.now(),
      currentHoldings: [],
      existingPositions: [],
      opportunities: [],
      recommendation: "",
    };

    // Summarize current holdings
    const balanceList = Array.isArray(balances) ? balances : [];
    plan.currentHoldings = balanceList.map((b) => ({
      token: b.symbol || b.tokenSymbol || "unknown",
      balance: b.balance || b.holdingAmount || "0",
      valueUsd: b.tokenPrice ? (parseFloat(b.holdingAmount || b.balance || 0) * parseFloat(b.tokenPrice)).toFixed(2) : null,
    }));

    // Summarize existing DeFi positions
    const positions = Array.isArray(defiPositions) ? defiPositions : [];
    plan.existingPositions = positions.map((p) => ({
      protocol: p.protocolName || p.protocol || "unknown",
      type: p.positionType || p.type || "unknown",
      value: p.totalValue || p.value || "0",
      apy: p.apy || null,
    }));

    // Summarize yield services from marketplace
    const services = Array.isArray(yieldServices) ? yieldServices : [];
    plan.opportunities = services.map((svc) => ({
      serviceId: svc.serviceId || svc.id,
      name: svc.name || svc.serviceName || "Unknown",
      price: svc.pricePerCall || svc.price || "0",
      description: svc.description || "",
    }));

    // Build recommendation
    const totalUsd = plan.currentHoldings.reduce((sum, h) => sum + parseFloat(h.valueUsd || 0), 0);
    const targetAmount = entities.amount ? parseFloat(entities.amount) : totalUsd;

    if (plan.opportunities.length > 0) {
      plan.recommendation =
        `Found ${plan.opportunities.length} yield service(s) on the marketplace. ` +
        `You have ${plan.currentHoldings.length} token(s) (est. $${totalUsd.toFixed(2)} total). ` +
        `Consider allocating $${targetAmount.toFixed(2)} across available yield strategies.`;
    } else if (plan.existingPositions.length > 0) {
      plan.recommendation =
        `You have ${plan.existingPositions.length} existing DeFi position(s). ` +
        `No additional yield services found on the marketplace yet. ` +
        `Monitor existing positions for optimal rebalancing.`;
    } else {
      plan.recommendation =
        `You have ${plan.currentHoldings.length} token(s) (est. $${totalUsd.toFixed(2)} total). ` +
        `No yield services or DeFi positions found. Consider providing liquidity on Uniswap ` +
        `or registering as a service provider on the marketplace to earn fees.`;
    }

    return plan;
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
