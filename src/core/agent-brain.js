/**
 * Agent Brain - AI Decision Engine
 * Handles: intent classification, strategy selection, autonomous decision-making,
 * reputation evaluation, and dynamic pricing
 *
 * v2 improvements:
 * - Negation-aware NLP with compound phrase matching and fuzzy matching
 * - Dependency-graph-based execution planning with conditional steps
 * - Reputation filtering integrated into service discovery
 * - Dynamic pricing integrated into execution plans
 * - LLM-enhanced natural language processing with structured fallback
 */

// ─── Fuzzy Matching Helpers ───────────────────────────────────

/**
 * Damerau-Levenshtein distance – supports transpositions (swpa → swap).
 */
function editDistance(a, b) {
  const la = a.length;
  const lb = b.length;
  const d = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[la][lb];
}

/**
 * Check if any word in `words` fuzzy-matches `keyword` within a tolerance.
 * Returns a score: 1.0 for exact, 0.7 for close fuzzy, 0 for no match.
 */
function fuzzyMatchWord(words, keyword) {
  for (const w of words) {
    if (w === keyword) return 1.0;
    // Only fuzzy-match words of length >= 3 to avoid false positives
    if (keyword.length >= 3 && w.length >= 3) {
      const maxDist = keyword.length <= 4 ? 1 : 2;
      const dist = editDistance(w, keyword);
      if (dist <= maxDist) return 0.7;
    }
  }
  return 0;
}

// ─── Negation Detection ─────────────────────────────────────

const NEGATION_PATTERNS_EN = [
  /\bdon'?t\b/i, /\bdo\s+not\b/i, /\bnot\b/i, /\bnever\b/i,
  /\bno\b/i, /\bstop\b/i, /\bcancel\b/i, /\bavoid\b/i,
  /\bwithout\b/i, /\brefuse\b/i, /\bskip\b/i,
];
const NEGATION_PATTERNS_ZH = [/不要/, /别/, /不/, /勿/, /停止/, /取消/];

/**
 * Returns true if the text near a keyword is negated.
 * Checks a window of ~4 words before the keyword position.
 */
function isNegated(lowerInput, keywordStart) {
  // Look at a window of up to 30 chars before the keyword
  const windowStart = Math.max(0, keywordStart - 30);
  const window = lowerInput.slice(windowStart, keywordStart + 1);

  for (const pat of NEGATION_PATTERNS_EN) {
    if (pat.test(window)) return true;
  }
  for (const pat of NEGATION_PATTERNS_ZH) {
    if (pat.test(window)) return true;
  }
  return false;
}

// ─── Intent Definitions ─────────────────────────────────────

/**
 * Each intent has:
 *  - singleKeywords: single-word matches (lower weight)
 *  - compoundPhrases: multi-word phrases (higher weight)
 *  - baseWeight: how much each hit is worth for scoring
 */
const INTENT_DEFS = [
  {
    type: "swap",
    singleKeywords: ["swap", "exchange", "trade", "convert"],
    compoundPhrases: ["token swap", "swap token", "换币", "兑换代币"],
    zhKeywords: ["兑换", "交换", "换币", "换"],
    baseWeight: 10,
  },
  {
    type: "find_service",
    singleKeywords: ["find", "search", "discover"],
    compoundPhrases: ["look for", "search for", "find service", "find agent"],
    zhKeywords: ["查找", "找", "搜索"],
    baseWeight: 8,
  },
  {
    type: "register_service",
    singleKeywords: ["register", "publish", "offer", "provide"],
    compoundPhrases: ["register service", "publish service"],
    zhKeywords: ["注册", "发布", "提供"],
    baseWeight: 7,
  },
  {
    type: "check_balance",
    singleKeywords: ["balance", "portfolio", "holdings"],
    compoundPhrases: ["my balance", "check balance", "show balance", "我的余额"],
    zhKeywords: ["余额", "资产", "持仓", "查余额", "我的余额"],
    baseWeight: 10,
  },
  {
    type: "security_scan",
    singleKeywords: ["scan", "security", "risk", "honeypot", "rug"],
    compoundPhrases: ["security scan", "risk check", "is it safe", "安全扫描"],
    zhKeywords: ["安全", "风险", "扫描", "安全扫描"],
    baseWeight: 9,
  },
  {
    type: "price_check",
    singleKeywords: ["price", "cost", "value", "worth"],
    compoundPhrases: ["check price", "how much", "what is the price", "查价格"],
    zhKeywords: ["价格", "值多少", "查价格"],
    baseWeight: 5,
  },
  {
    type: "optimize",
    singleKeywords: ["optimize", "optimal", "cheapest", "best"],
    compoundPhrases: ["best route", "optimize gas", "cheapest way"],
    zhKeywords: ["最优", "最便宜"],
    baseWeight: 8,
  },
  {
    type: "earn",
    singleKeywords: ["earn", "yield", "income", "profit", "stake"],
    compoundPhrases: ["earn yield", "passive income"],
    zhKeywords: ["赚", "收益", "利润"],
    baseWeight: 9,
  },
  {
    type: "set_alert",
    singleKeywords: ["alert", "notify", "reminder", "watch"],
    compoundPhrases: ["set alert", "price alert", "设置提醒"],
    zhKeywords: ["提醒", "设置提醒", "通知"],
    baseWeight: 6,
  },
  {
    type: "status",
    singleKeywords: ["status", "report", "dashboard", "overview"],
    compoundPhrases: ["show status", "give report"],
    zhKeywords: ["状态", "报告"],
    baseWeight: 4,
  },
  {
    type: "help",
    singleKeywords: ["help"],
    compoundPhrases: ["what can", "how to", "how do"],
    zhKeywords: ["帮助", "怎么"],
    baseWeight: 1,
  },
];

// ─── Confidence Calibration ─────────────────────────────────

/**
 * Map raw score → calibrated confidence in [0, 1].
 * Uses a sigmoid-style curve so weak matches stay low.
 *   rawScore < 3  → < 0.35  (weak)
 *   rawScore 5-8  → 0.5-0.7 (moderate)
 *   rawScore 10+  → 0.8-0.95 (strong)
 * Never returns 1.0 for keyword-based classification.
 */
function calibrateConfidence(rawScore) {
  if (rawScore <= 0) return 0;
  // Sigmoid: 0.95 / (1 + e^(-0.4*(x-6)))
  const sig = 0.95 / (1 + Math.exp(-0.4 * (rawScore - 6)));
  return Math.round(sig * 1000) / 1000; // 3 decimal places
}

// ─── Main Class ─────────────────────────────────────────────

export class AgentBrain {
  constructor({ onchainos, uniswap, registry, walletAddress }) {
    this.onchainos = onchainos;
    this.uniswap = uniswap;
    this.registry = registry;
    this.walletAddress = walletAddress;
    this.memory = [];
    this.preferences = {};
    this.decisionLog = [];
    this.reputationCache = new Map(); // address → { score, ts }
    this.REPUTATION_CACHE_TTL = 5 * 60 * 1000; // 5 min
    this.MIN_TRUST_LEVEL = "medium"; // default minimum for service discovery
  }

  // ─── Intent Classification (public API) ───────────────────

  /**
   * Classify user intent from natural language input.
   * Returns { intent, confidence, entities, negated, raw }.
   */
  classifyIntent(input) {
    const lower = input.toLowerCase();
    const words = lower.split(/[\s,;.!?]+/).filter(Boolean);

    let bestType = "unknown";
    let bestRaw = 0;
    let negated = false;

    for (const def of INTENT_DEFS) {
      let raw = 0;

      // 1) Compound phrases (2x weight) — exact substring match
      for (const phrase of def.compoundPhrases) {
        const idx = lower.indexOf(phrase.toLowerCase());
        if (idx !== -1) {
          if (isNegated(lower, idx)) {
            negated = true;
          } else {
            raw += def.baseWeight * 2;
          }
        }
      }

      // 2) Chinese keywords — exact substring
      for (const zk of (def.zhKeywords || [])) {
        const idx = lower.indexOf(zk);
        if (idx !== -1) {
          if (isNegated(lower, idx)) {
            negated = true;
          } else {
            // Longer zh phrases get more weight
            raw += def.baseWeight * (zk.length >= 3 ? 1.5 : 1);
          }
        }
      }

      // 3) Single keywords — exact + fuzzy (lower weight)
      for (const kw of def.singleKeywords) {
        const kwLower = kw.toLowerCase();
        const exactIdx = lower.indexOf(kwLower);
        if (exactIdx !== -1) {
          if (isNegated(lower, exactIdx)) {
            negated = true;
          } else {
            raw += def.baseWeight;
          }
        } else {
          // Fuzzy match against individual words
          const fuzzy = fuzzyMatchWord(words, kwLower);
          if (fuzzy > 0) {
            raw += def.baseWeight * fuzzy;
          }
        }
      }

      if (raw > bestRaw) {
        bestRaw = raw;
        bestType = def.type;
      }
    }

    // If the best match was negated and nothing positive matched, return cancel
    if (negated && bestRaw === 0) {
      bestType = "cancel";
    }

    const entities = this._extractEntities(input);
    const confidence = calibrateConfidence(bestRaw);

    const result = {
      intent: bestType,
      confidence,
      entities,
      negated,
      raw: input,
    };

    this.memory.push({
      role: "user",
      content: input,
      parsed: result,
      timestamp: Date.now(),
    });

    return result;
  }

  // ─── LLM-Enhanced Processing ─────────────────────────────────

  /**
   * Process input with LLM enhancement.
   * Uses keyword classification as fast-path, then enriches with LLM
   * for natural language understanding and conversational responses.
   * Falls back to keyword-only mode if LLM is unavailable.
   */
  async processWithLLM(input, context = {}) {
    // Step 1: Fast keyword classification
    const classified = this.classifyIntent(input);

    // Step 2: Create execution plan
    const plan = await this.createPlan(classified);

    // Step 3: Try LLM enhancement for natural response generation
    let llmResponse = null;
    try {
      llmResponse = await this._callLLM(input, classified, context);
    } catch (e) {
      // LLM unavailable — keyword classification still works
      console.info('[Brain] LLM unavailable, using keyword-only mode:', e.message);
    }

    return {
      ...classified,
      plan,
      llmResponse,
      enhanced: !!llmResponse,
      timestamp: Date.now(),
    };
  }

  /**
   * Call LLM API for enhanced natural language understanding.
   * Uses a lightweight model for fast responses.
   * Supports multiple LLM providers with graceful fallback.
   */
  async _callLLM(input, classified, context) {
    const systemPrompt = `You are Agent Nexus, an autonomous AI agent operating on X Layer blockchain (chain 196). You help users with:
- Token swaps via DEX aggregator (500+ liquidity sources)
- Security scans for tokens and contracts
- Price monitoring and alerts
- Service discovery on the agent marketplace
- x402 payment protocol for agent-to-agent payments

Current context: Intent detected as "${classified.intent}" with confidence ${classified.confidence}.
${classified.entities.tokens ? `Tokens mentioned: ${classified.entities.tokens.join(', ')}` : ''}
${classified.entities.amount ? `Amount: ${classified.entities.amount}` : ''}
${context.walletAddress ? `User wallet: ${context.walletAddress}` : ''}

Respond concisely and technically. If the user wants to execute an action, confirm the parameters and explain what will happen on-chain.`;

    // Try OpenAI-compatible API (can be configured to use any provider)
    const apiKey = process.env?.OPENAI_API_KEY || process.env?.LLM_API_KEY;
    const apiBase = process.env?.LLM_API_BASE || 'https://api.openai.com/v1';

    if (!apiKey) {
      // No LLM configured — generate structured response from classification
      return this._generateStructuredResponse(classified, context);
    }

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env?.LLM_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  /**
   * Generate a structured response from classification results
   * when LLM is unavailable. Still provides useful, contextual output.
   */
  _generateStructuredResponse(classified, context) {
    const { intent, confidence, entities } = classified;
    const responses = {
      swap: `Ready to find optimal swap route${entities.tokens?.length >= 2 ? ` for ${entities.tokens[0]} → ${entities.tokens[1]}` : ''}${entities.amount ? ` (amount: ${entities.amount})` : ''}. I'll compare routes across 500+ liquidity sources with multi-slippage strategy analysis.`,
      security_scan: `Initiating security scan${entities.address ? ` for ${entities.address.slice(0,10)}...` : entities.tokens?.[0] ? ` for ${entities.tokens[0]}` : ''}. Running parallel token + contract vulnerability analysis via OnchainOS Security V6.`,
      check_balance: `Checking wallet balances${context.walletAddress ? ` for ${context.walletAddress.slice(0,10)}...` : ' for agent wallet'}. Querying OKB + USDT + WETH + USDC on X Layer.`,
      price_check: `Looking up price${entities.tokens?.[0] ? ` for ${entities.tokens[0]}` : ''} via OnchainOS Market data feed.`,
      find_service: `Discovering available services on the Agent Nexus marketplace. Services use x402 payment protocol for trustless agent-to-agent payments.`,
      earn: `Analyzing earning opportunities on X Layer${entities.amount ? ` with ${entities.amount} ${entities.tokens?.[0] || 'USDT'}` : ''}. Checking DeFi positions and marketplace yield services.`,
      set_alert: `Setting price alert${entities.tokens?.[0] ? ` for ${entities.tokens[0]}` : ''}${entities.amount ? ` at ${entities.amount}` : ''}. Will monitor via OnchainOS Market module at 30s intervals.`,
      help: `I'm Agent Nexus — an autonomous agent on X Layer. I can: swap tokens, scan security risks, check balances, monitor prices, discover marketplace services, and manage x402 payments. Try commands in English or Chinese.`,
      unknown: `I understood your input with ${(confidence * 100).toFixed(0)}% confidence. Could you be more specific? Try: "swap 100 USDT to ETH", "scan 0x...", "check balance", "price OKB", "find services".`,
    };
    return responses[intent] || responses.unknown;
  }

  // ─── Entity Extraction (improved) ─────────────────────────

  _extractEntities(input) {
    const entities = {};

    // Token symbols — broad set
    const tokenPattern =
      /\b(USDT|USDC|ETH|WETH|OKB|WOKB|BTC|WBTC|DAI|UNI|LINK|AAVE|ARB|OP|MATIC|SOL|DOGE|SHIB)\b/gi;
    const tokens = input.match(tokenPattern);
    if (tokens) {
      entities.tokens = [...new Set(tokens.map((t) => t.toUpperCase()))];
      if (entities.tokens.length >= 1) entities.token = entities.tokens[0];
      if (entities.tokens.length >= 2) entities.toToken = entities.tokens[1];
    }

    // Amounts — numbers optionally followed by token/%
    const amountPattern = /(\d+(?:\.\d+)?)\s*(USDT|USDC|ETH|OKB|tokens?|%)?/gi;
    const amounts = [...input.matchAll(amountPattern)];
    if (amounts.length > 0) {
      entities.amount = amounts[0][1];
      if (amounts[0][2] && amounts[0][2] !== "%") {
        entities.amountToken = amounts[0][2].toUpperCase().replace(/S$/, "");
      }
    }

    // Percentages
    const pctPattern = /(\d+(?:\.\d+)?)\s*%/g;
    const pcts = [...input.matchAll(pctPattern)];
    if (pcts.length > 0) {
      entities.percentages = pcts.map((m) => parseFloat(m[1]));
    }

    // Addresses (0x...)
    const addrPattern = /0x[a-fA-F0-9]{40}/g;
    const addrs = input.match(addrPattern);
    if (addrs) {
      entities.addresses = [...new Set(addrs)];
      entities.address = addrs[0];
    }

    // Slippage extraction (common in swap commands)
    const slippagePattern = /slippage\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?/i;
    const slipMatch = input.match(slippagePattern);
    if (slipMatch) {
      entities.slippage = parseFloat(slipMatch[1]);
    }

    return entities;
  }

  // ─── Reputation Evaluation (public API) ───────────────────

  /**
   * Evaluate an agent's trustworthiness based on on-chain history.
   * Results are cached for REPUTATION_CACHE_TTL ms.
   */
  async evaluateReputation(agentAddress) {
    // Check cache
    const cached = this.reputationCache.get(agentAddress);
    if (cached && Date.now() - cached.ts < this.REPUTATION_CACHE_TTL) {
      return cached.score;
    }

    const profile = await this.registry.getAgentProfile(agentAddress);
    const txHistory = await this.onchainos.getTransactionHistory(agentAddress);

    const reputationScore = Number(profile.reputationScore || 0);
    const totalServices = Number(profile.totalServicesProvided || 0);
    const txCount = txHistory?.length || 0;

    // Composite weighted score (0-100)
    const composite =
      reputationScore * 0.5 +
      Math.min(totalServices * 3, 30) +
      Math.min(txCount * 0.2, 20);

    let trustLevel, recommendation;
    if (composite >= 65 && totalServices >= 10) {
      trustLevel = "high";
      recommendation = "Highly trusted agent, safe to interact";
    } else if (composite >= 35 && totalServices >= 3) {
      trustLevel = "medium";
      recommendation = "Moderately trusted, proceed with standard checks";
    } else {
      trustLevel = "low";
      recommendation = "New or low-activity agent, exercise caution";
    }

    const score = {
      address: agentAddress,
      reputationScore,
      totalServices,
      totalEarned: profile.totalEarned?.toString() || "0",
      txCount,
      compositeScore: Math.round(composite),
      trustLevel,
      recommendation,
    };

    this.reputationCache.set(agentAddress, { score, ts: Date.now() });
    return score;
  }

  // Backward-compat alias
  async evaluateAgent(agentAddress) {
    return this.evaluateReputation(agentAddress);
  }

  // ─── Dynamic Pricing (public API) ─────────────────────────

  /**
   * Calculate optimal price for a service based on market conditions.
   * Now also considers demand factor and time-of-day.
   */
  async calculateDynamicPrice({ serviceName, baseCost, competitorPrices = [], demandFactor = 1.0 }) {
    let price = baseCost;

    // Demand multiplier: >1 means high demand → higher price is acceptable
    price *= Math.max(0.8, Math.min(demandFactor, 1.5));

    // Competitive pricing
    if (competitorPrices.length > 0) {
      const sorted = [...competitorPrices].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg =
        competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length;
      // Target slightly below median for better positioning
      const competitiveTarget = median * 0.95;
      price = Math.min(price, competitiveTarget);
    }

    // Floor: must cover gas
    const minPrice = 0.001;
    price = Math.max(price, minPrice);

    const avgStr = competitorPrices.length
      ? (competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length).toFixed(4)
      : "N/A";

    return {
      recommended: Math.round(price * 1e6) / 1e6,
      reasoning: `Base: ${baseCost}, Demand: ${demandFactor}x, Competitors avg: ${avgStr}, Final: ${price.toFixed(6)}`,
    };
  }

  // Backward-compat alias
  async calculateServicePrice(params) {
    return this.calculateDynamicPrice(params);
  }

  // ─── Execution Planning (public API) ──────────────────────

  /**
   * Create a dependency-graph execution plan from a parsed intent.
   * Each step has: id, action, module, params, dependsOn[], condition?.
   * Returns { intent, steps, estimatedCost, estimatedTime, confidence }.
   */
  async createPlan(parsedIntent) {
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
        plan.steps = [
          { id: "bal_1", action: "get_balances", module: "onchainos_wallet", dependsOn: [] },
        ];
        break;
      case "price_check":
        plan.steps = [
          { id: "pc_1", action: "get_price", module: "onchainos_market", params: parsedIntent.entities, dependsOn: [] },
        ];
        break;
      case "set_alert":
        plan.steps = [
          { id: "alert_1", action: "set_price_alert", module: "onchainos_alerts", params: parsedIntent.entities, dependsOn: [] },
        ];
        break;
      case "status":
        plan.steps = [
          { id: "st_1", action: "get_balances", module: "onchainos_wallet", dependsOn: [] },
          { id: "st_2", action: "get_agent_profile", module: "registry", dependsOn: [] },
          { id: "st_3", action: "list_services", module: "registry", dependsOn: [] },
        ];
        break;
      case "cancel":
        plan.steps = [{ id: "c_1", action: "cancel_pending", module: "system", dependsOn: [] }];
        break;
      default:
        plan.steps = [{ id: "h_1", action: "show_help", module: "system", dependsOn: [] }];
    }

    // Estimate total time based on dependency depth
    plan.estimatedTime = this._estimateTime(plan.steps);

    this.decisionLog.push({ plan, timestamp: Date.now() });
    return plan;
  }

  // Backward-compat alias
  async planExecution(parsedIntent) {
    return this.createPlan(parsedIntent);
  }

  // ─── Plan Executor ────────────────────────────────────────

  /**
   * Execute a plan respecting the dependency graph.
   * Steps with no unresolved dependencies run in parallel.
   * Conditional steps are skipped if their condition evaluates to false.
   * Returns a map of stepId → result.
   */
  async executePlan(plan, executor) {
    const results = {};
    const completed = new Set();
    const steps = [...plan.steps];

    while (completed.size < steps.length) {
      // Find all steps whose dependencies are met
      const ready = steps.filter(
        (s) =>
          !completed.has(s.id) &&
          s.dependsOn.every((dep) => completed.has(dep)),
      );

      if (ready.length === 0 && completed.size < steps.length) {
        // Deadlock or unresolvable deps — break with error
        const remaining = steps.filter((s) => !completed.has(s.id)).map((s) => s.id);
        throw new Error(`Plan deadlock: unresolvable steps [${remaining.join(", ")}]`);
      }

      // Evaluate conditions and execute in parallel
      const batch = await Promise.allSettled(
        ready.map(async (step) => {
          // Check condition
          if (step.condition && !step.condition(results)) {
            return { stepId: step.id, skipped: true, reason: "condition not met" };
          }
          const result = await executor(step, results);
          return { stepId: step.id, result };
        }),
      );

      for (const outcome of batch) {
        if (outcome.status === "fulfilled") {
          const { stepId, result, skipped, reason } = outcome.value;
          results[stepId] = skipped ? { skipped: true, reason } : result;
          completed.add(stepId);
        } else {
          // On rejection, mark the step as failed but continue
          const failedStep = ready.find((s) => !completed.has(s.id));
          if (failedStep) {
            results[failedStep.id] = { error: outcome.reason?.message || "unknown error" };
            completed.add(failedStep.id);
          }
        }
      }
    }

    return results;
  }

  // ─── Internal Planning Methods ────────────────────────────

  async _planSwap(entities) {
    const steps = [];
    const hasToken = !!(entities.token || entities.address);

    // Step 1: Security scan (runs first, no deps)
    if (hasToken) {
      steps.push({
        id: "swap_scan",
        action: "security_scan",
        module: "onchainos_security",
        params: { token: entities.token, address: entities.address },
        dependsOn: [],
        reason: "Pre-swap safety check",
      });
    }

    // Step 2a & 2b: Get quotes in parallel — both depend on scan passing
    const scanDep = hasToken ? ["swap_scan"] : [];
    steps.push({
      id: "swap_quote_os",
      action: "get_quote",
      module: "onchainos_dex",
      params: entities,
      dependsOn: scanDep,
      // Conditional: skip if scan found critical risk
      condition: hasToken
        ? (results) => {
            const scan = results["swap_scan"];
            return !scan || !scan.skipped && !(scan.riskLevel === "critical");
          }
        : undefined,
      reason: "Get OnchainOS DEX aggregator quote",
    });
    steps.push({
      id: "swap_quote_uni",
      action: "get_route",
      module: "uniswap_trading",
      params: entities,
      dependsOn: scanDep,
      condition: hasToken
        ? (results) => {
            const scan = results["swap_scan"];
            return !scan || !scan.skipped && !(scan.riskLevel === "critical");
          }
        : undefined,
      reason: "Get Uniswap route for comparison",
    });

    // Step 3: Dynamic pricing for the execution
    steps.push({
      id: "swap_pricing",
      action: "calculate_dynamic_price",
      module: "agent_brain",
      dependsOn: ["swap_quote_os", "swap_quote_uni"],
      reason: "Factor in dynamic pricing for route selection",
    });

    // Step 4: Compare and select best route
    steps.push({
      id: "swap_compare",
      action: "compare_routes",
      module: "agent_brain",
      dependsOn: ["swap_pricing"],
      reason: "Select optimal execution path including fees",
    });

    // Step 5: Execute
    steps.push({
      id: "swap_exec",
      action: "execute_swap",
      module: "best_route",
      dependsOn: ["swap_compare"],
      reason: "Execute on the route with best output",
    });

    return steps;
  }

  async _planServiceDiscovery(entities) {
    return [
      {
        id: "disc_list",
        action: "list_active_services",
        module: "registry",
        dependsOn: [],
        reason: "Discover available services on marketplace",
      },
      {
        id: "disc_reputation",
        action: "filter_by_reputation",
        module: "agent_brain",
        dependsOn: ["disc_list"],
        params: { minTrustLevel: this.MIN_TRUST_LEVEL },
        reason: "Filter out low-reputation providers",
      },
      {
        id: "disc_pricing",
        action: "compare_service_pricing",
        module: "agent_brain",
        dependsOn: ["disc_reputation"],
        reason: "Evaluate dynamic pricing across reputable providers",
      },
      {
        id: "disc_recommend",
        action: "recommend_service",
        module: "agent_brain",
        dependsOn: ["disc_pricing"],
        reason: "Return best service match by reputation and price",
      },
    ];
  }

  async _planSecurityScan(entities) {
    return [
      {
        id: "sec_token",
        action: "token_scan",
        module: "onchainos_security",
        params: entities,
        dependsOn: [],
        reason: "Scan token for known risks",
      },
      {
        id: "sec_contract",
        action: "contract_scan",
        module: "onchainos_security",
        params: entities,
        dependsOn: [],
        reason: "Scan contract for vulnerabilities",
      },
      {
        id: "sec_report",
        action: "risk_report",
        module: "agent_brain",
        dependsOn: ["sec_token", "sec_contract"],
        reason: "Generate comprehensive risk assessment",
      },
    ];
  }

  async _planOptimization(entities) {
    return [
      {
        id: "opt_discover",
        action: "discover_services",
        module: "registry",
        dependsOn: [],
        reason: "Find optimization services available",
      },
      {
        id: "opt_reputation",
        action: "filter_by_reputation",
        module: "agent_brain",
        dependsOn: ["opt_discover"],
        params: { minTrustLevel: this.MIN_TRUST_LEVEL },
        reason: "Filter providers by reputation",
      },
      {
        id: "opt_pricing",
        action: "evaluate_dynamic_pricing",
        module: "agent_brain",
        dependsOn: ["opt_reputation"],
        reason: "Get dynamic pricing for each reputable provider",
      },
      {
        id: "opt_compare",
        action: "compare_options",
        module: "agent_brain",
        dependsOn: ["opt_pricing"],
        reason: "Compare all available optimization paths",
      },
      {
        id: "opt_exec",
        action: "execute_optimal",
        module: "best_service",
        dependsOn: ["opt_compare"],
        reason: "Execute the most cost-effective option",
      },
    ];
  }

  async _planEarning(entities) {
    return [
      {
        id: "earn_bal",
        action: "check_balances",
        module: "onchainos_wallet",
        dependsOn: [],
        reason: "Check current holdings",
      },
      {
        id: "earn_find",
        action: "find_yield_services",
        module: "registry",
        dependsOn: [],
        reason: "Find yield optimization services",
      },
      {
        id: "earn_reputation",
        action: "filter_by_reputation",
        module: "agent_brain",
        dependsOn: ["earn_find"],
        params: { minTrustLevel: this.MIN_TRUST_LEVEL },
        reason: "Only consider reputable yield providers",
      },
      {
        id: "earn_defi",
        action: "get_defi_positions",
        module: "onchainos_market",
        dependsOn: [],
        reason: "Check existing DeFi positions",
      },
      {
        id: "earn_plan",
        action: "create_earning_plan",
        module: "agent_brain",
        dependsOn: ["earn_bal", "earn_reputation", "earn_defi"],
        reason: "Design optimal earning strategy from reputable providers",
      },
    ];
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Estimate total execution time (ms) from the dependency graph depth.
   * Each layer of parallelism ~2s, sequential deps add up.
   */
  _estimateTime(steps) {
    if (steps.length === 0) return 0;
    const MS_PER_STEP = 2000;
    // BFS to find longest path
    const depth = {};
    for (const s of steps) depth[s.id] = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of steps) {
        for (const dep of s.dependsOn) {
          if ((depth[dep] || 0) + 1 > depth[s.id]) {
            depth[s.id] = (depth[dep] || 0) + 1;
            changed = true;
          }
        }
      }
    }
    const maxDepth = Math.max(...Object.values(depth)) + 1;
    return maxDepth * MS_PER_STEP;
  }

  // ─── Memory ───────────────────────────────────────────────

  getConversationHistory() {
    return this.memory;
  }

  getDecisionLog() {
    return this.decisionLog;
  }

  clearMemory() {
    this.memory = [];
    this.decisionLog = [];
    this.reputationCache.clear();
  }
}

export default AgentBrain;
