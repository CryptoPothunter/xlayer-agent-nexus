/**
 * Agent Brain - AI Decision Engine
 * Handles: intent classification, strategy selection, autonomous decision-making,
 * reputation evaluation, and dynamic pricing
 */

export class AgentBrain {
  constructor({ onchainos, uniswap, registry, walletAddress }) {
    this.onchainos = onchainos;
    this.uniswap = uniswap;
    this.registry = registry;
    this.walletAddress = walletAddress;
    this.memory = [];
    this.preferences = {};
    this.decisionLog = [];
  }

  // ─── Intent Classification ─────────────────────────────

  /**
   * Classify user intent from natural language input
   */
  classifyIntent(input) {
    const lower = input.toLowerCase();
    const intents = [
      {
        type: "swap",
        keywords: ["swap", "exchange", "trade", "convert", "兑换", "交换", "换"],
        priority: 10,
      },
      {
        type: "find_service",
        keywords: ["find", "search", "discover", "look for", "查找", "找", "搜索"],
        priority: 8,
      },
      {
        type: "register_service",
        keywords: ["register", "publish", "offer", "provide", "注册", "发布", "提供"],
        priority: 7,
      },
      {
        type: "check_balance",
        keywords: ["balance", "portfolio", "holdings", "my balance", "check balance", "余额", "资产", "持仓", "查余额"],
        priority: 10,
      },
      {
        type: "security_scan",
        keywords: ["scan", "safe", "security", "risk", "honeypot", "rug", "安全", "风险", "扫描"],
        priority: 9,
      },
      {
        type: "price_check",
        keywords: ["price", "cost", "value", "worth", "价格", "值多少"],
        priority: 5,
      },
      {
        type: "optimize",
        keywords: ["optimize", "best", "optimal", "cheapest", "最优", "最便宜"],
        priority: 8,
      },
      {
        type: "earn",
        keywords: ["earn", "yield", "income", "profit", "赚", "收益", "利润"],
        priority: 9,
      },
      {
        type: "status",
        keywords: ["status", "report", "dashboard", "overview", "状态", "报告"],
        priority: 4,
      },
      {
        type: "help",
        keywords: ["help", "what can", "how to", "帮助", "怎么"],
        priority: 1,
      },
    ];

    let bestMatch = { type: "unknown", score: 0 };

    for (const intent of intents) {
      let score = 0;
      for (const kw of intent.keywords) {
        if (lower.includes(kw)) {
          score += intent.priority;
        }
      }
      if (score > bestMatch.score) {
        bestMatch = { type: intent.type, score };
      }
    }

    // Extract entities
    const entities = this._extractEntities(input);

    const result = { intent: bestMatch.type, confidence: Math.min(bestMatch.score / 10, 1), entities, raw: input };
    this.memory.push({ role: "user", content: input, parsed: result, timestamp: Date.now() });
    return result;
  }

  // ─── Strategy Engine ───────────────────────────────────

  /**
   * Given an intent, decide the best execution plan
   */
  async planExecution(parsedIntent) {
    const plan = {
      intent: parsedIntent.intent,
      steps: [],
      estimatedCost: 0,
      estimatedTime: 0,
      confidence: parsedIntent.confidence,
    };

    switch (parsedIntent.intent) {
      case "swap":
        plan.steps = await this._planSwap(parsedIntent.entities);
        break;
      case "find_service":
        plan.steps = await this._planServiceDiscovery(parsedIntent.entities);
        break;
      case "security_scan":
        plan.steps = await this._planSecurityScan(parsedIntent.entities);
        break;
      case "optimize":
        plan.steps = await this._planOptimization(parsedIntent.entities);
        break;
      case "earn":
        plan.steps = await this._planEarning(parsedIntent.entities);
        break;
      case "check_balance":
        plan.steps = [{ action: "get_balances", module: "onchainos_wallet" }];
        break;
      case "price_check":
        plan.steps = [{ action: "get_price", module: "onchainos_market", params: parsedIntent.entities }];
        break;
      case "status":
        plan.steps = [
          { action: "get_balances", module: "onchainos_wallet" },
          { action: "get_agent_profile", module: "registry" },
          { action: "list_services", module: "registry" },
        ];
        break;
      default:
        plan.steps = [{ action: "show_help", module: "system" }];
    }

    this.decisionLog.push({ plan, timestamp: Date.now() });
    return plan;
  }

  // ─── Reputation Evaluation ─────────────────────────────

  /**
   * Evaluate an agent's trustworthiness based on on-chain history
   */
  async evaluateAgent(agentAddress) {
    const profile = await this.registry.getAgentProfile(agentAddress);
    const txHistory = await this.onchainos.getTransactionHistory(agentAddress);

    const score = {
      address: agentAddress,
      reputationScore: Number(profile.reputationScore || 0),
      totalServices: Number(profile.totalServicesProvided || 0),
      totalEarned: profile.totalEarned?.toString() || "0",
      txCount: txHistory.length || 0,
      trustLevel: "unknown",
      recommendation: "",
    };

    // Calculate trust level
    if (score.reputationScore >= 90 && score.totalServices >= 10) {
      score.trustLevel = "high";
      score.recommendation = "Highly trusted agent, safe to interact";
    } else if (score.reputationScore >= 60 && score.totalServices >= 3) {
      score.trustLevel = "medium";
      score.recommendation = "Moderately trusted, proceed with standard checks";
    } else {
      score.trustLevel = "low";
      score.recommendation = "New or low-activity agent, exercise caution";
    }

    return score;
  }

  // ─── Dynamic Pricing ──────────────────────────────────

  /**
   * Calculate optimal price for a service based on market conditions
   */
  async calculateServicePrice({ serviceName, baseCost, competitorPrices = [] }) {
    // Factor in: market rates, demand (call frequency), competition
    let price = baseCost;

    // If competitors exist, price competitively
    if (competitorPrices.length > 0) {
      const avgCompetitor = competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length;
      // Slightly undercut average for market penetration
      price = Math.min(price, avgCompetitor * 0.95);
    }

    // Ensure minimum viable price (covers gas)
    const minPrice = 0.001; // 0.001 USDT minimum
    price = Math.max(price, minPrice);

    return {
      recommended: price,
      reasoning: `Base: ${baseCost}, Competitors avg: ${competitorPrices.length ? (competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length).toFixed(4) : "N/A"}, Final: ${price.toFixed(6)}`,
    };
  }

  // ─── Internal Planning Methods ─────────────────────────

  async _planSwap(entities) {
    const steps = [];

    // Step 1: Security scan on tokens
    if (entities.token) {
      steps.push({
        action: "security_scan",
        module: "onchainos_security",
        params: { token: entities.token },
        reason: "Pre-swap safety check",
      });
    }

    // Step 2: Get quotes from both OnchainOS and Uniswap
    steps.push({
      action: "get_quote",
      module: "onchainos_dex",
      params: entities,
      reason: "Get OnchainOS DEX aggregator quote",
    });
    steps.push({
      action: "get_route",
      module: "uniswap_trading",
      params: entities,
      reason: "Get Uniswap route for comparison",
    });

    // Step 3: Compare and select best route
    steps.push({
      action: "compare_routes",
      module: "agent_brain",
      reason: "Select optimal execution path",
    });

    // Step 4: Execute via best route
    steps.push({
      action: "execute_swap",
      module: "best_route",
      reason: "Execute on the route with best output",
    });

    return steps;
  }

  async _planServiceDiscovery(entities) {
    return [
      {
        action: "list_active_services",
        module: "registry",
        reason: "Discover available services on marketplace",
      },
      {
        action: "evaluate_providers",
        module: "agent_brain",
        reason: "Assess provider reputation and pricing",
      },
      {
        action: "recommend_service",
        module: "agent_brain",
        reason: "Return best service match",
      },
    ];
  }

  async _planSecurityScan(entities) {
    return [
      {
        action: "token_scan",
        module: "onchainos_security",
        params: entities,
        reason: "Scan token for known risks",
      },
      {
        action: "contract_scan",
        module: "onchainos_security",
        params: entities,
        reason: "Scan contract for vulnerabilities",
      },
      {
        action: "risk_report",
        module: "agent_brain",
        reason: "Generate comprehensive risk assessment",
      },
    ];
  }

  async _planOptimization(entities) {
    return [
      {
        action: "discover_services",
        module: "registry",
        reason: "Find optimization services available",
      },
      {
        action: "compare_options",
        module: "agent_brain",
        reason: "Compare all available optimization paths",
      },
      {
        action: "execute_optimal",
        module: "best_service",
        reason: "Execute the most cost-effective option",
      },
    ];
  }

  async _planEarning(entities) {
    return [
      {
        action: "check_balances",
        module: "onchainos_wallet",
        reason: "Check current holdings",
      },
      {
        action: "find_yield_services",
        module: "registry",
        reason: "Find yield optimization services",
      },
      {
        action: "get_defi_positions",
        module: "onchainos_market",
        reason: "Check existing DeFi positions",
      },
      {
        action: "create_earning_plan",
        module: "agent_brain",
        reason: "Design optimal earning strategy",
      },
    ];
  }

  // ─── Entity Extraction ─────────────────────────────────

  _extractEntities(input) {
    const entities = {};

    // Extract token symbols
    const tokenPattern = /\b(USDT|USDC|ETH|WETH|OKB|WOKB|BTC|WBTC)\b/gi;
    const tokens = input.match(tokenPattern);
    if (tokens) {
      entities.tokens = [...new Set(tokens.map((t) => t.toUpperCase()))];
      if (entities.tokens.length >= 1) entities.token = entities.tokens[0];
      if (entities.tokens.length >= 2) entities.toToken = entities.tokens[1];
    }

    // Extract amounts
    const amountPattern = /(\d+(?:\.\d+)?)\s*(USDT|USDC|ETH|OKB|tokens?)?/gi;
    const amounts = [...input.matchAll(amountPattern)];
    if (amounts.length > 0) {
      entities.amount = amounts[0][1];
    }

    // Extract addresses
    const addrPattern = /0x[a-fA-F0-9]{40}/g;
    const addrs = input.match(addrPattern);
    if (addrs) entities.address = addrs[0];

    return entities;
  }

  // ─── Memory ────────────────────────────────────────────

  getConversationHistory() {
    return this.memory;
  }

  getDecisionLog() {
    return this.decisionLog;
  }

  clearMemory() {
    this.memory = [];
    this.decisionLog = [];
  }
}

export default AgentBrain;
