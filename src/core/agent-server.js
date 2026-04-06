/**
 * Agent HTTP Server - Lightweight network layer for agent-to-agent communication
 * Exposes service endpoints matching the x402 protocol flow over HTTP.
 *
 * This module is optional — the system works without it (CLI mode).
 * Start it by setting the AGENT_SERVER_PORT environment variable.
 *
 * Endpoints:
 *   GET  /health                    — Health check
 *   GET  /agent/profile             — This agent's profile
 *   GET  /services                  — List available services
 *   POST /services/:name/quote      — Get a price quote for a service
 *   POST /services/:name/execute    — Execute a service (after payment verification)
 */
import { createServer } from "http";

// ─── Quote Store (in-memory, with TTL-based expiry) ─────────
const quoteStore = new Map(); // quoteId → { amount, currency, service, params, expiresAt }

/**
 * Store a quote so it can be validated during payment verification.
 */
function storeQuote(quoteId, { amount, currency, service, params, expiresAt }) {
  quoteStore.set(quoteId, { amount, currency, service, params, expiresAt });
}

/**
 * Look up and validate a stored quote.
 * Returns { valid, quote?, error? }.
 */
function validateQuote(quoteId, { expectedAmount, expectedCurrency }) {
  const quote = quoteStore.get(quoteId);
  if (!quote) return { valid: false, error: "Quote not found" };
  if (Date.now() > quote.expiresAt) {
    quoteStore.delete(quoteId);
    return { valid: false, error: "Quote expired" };
  }
  if (expectedAmount !== undefined && parseFloat(quote.amount) > parseFloat(expectedAmount)) {
    return { valid: false, error: `Insufficient amount: expected ${quote.amount}, got ${expectedAmount}` };
  }
  if (expectedCurrency !== undefined && quote.currency !== expectedCurrency) {
    return { valid: false, error: `Currency mismatch: expected ${quote.currency}, got ${expectedCurrency}` };
  }
  return { valid: true, quote };
}

/**
 * Parse and verify the X-402-Payment header.
 *
 * Supported formats:
 *   x402:txhash:<TX_HASH>
 *   x402:proof:<QUOTE_ID>:<AMOUNT>:<CURRENCY>:<NETWORK>
 *
 * Returns { verified, method, details?, error? }
 */
async function verifyPaymentHeader(headerValue, { onchainos, recipientAddress, expectedAmount, expectedCurrency }) {
  if (!headerValue || typeof headerValue !== "string") {
    return { verified: false, error: "Missing or empty payment header" };
  }

  const parts = headerValue.split(":");
  if (parts.length < 3 || parts[0] !== "x402") {
    return { verified: false, error: "Invalid x402 header format. Expected x402:txhash:<hash> or x402:proof:<quoteId>:<amount>:<currency>:<network>" };
  }

  const method = parts[1];

  // ── txhash verification ──
  if (method === "txhash") {
    const txHash = parts.slice(2).join(":"); // rejoin in case hash contains colons (unlikely but safe)
    if (!txHash) {
      return { verified: false, error: "Missing transaction hash" };
    }
    try {
      const verification = await onchainos.verifyPaymentOnChain({
        txHash,
        expectedTo: recipientAddress,
        expectedAmount,
      });
      if (!verification.verified) {
        return { verified: false, method: "txhash", error: "On-chain verification failed: transaction not confirmed or amounts mismatch", details: verification };
      }
      return { verified: true, method: "txhash", txHash, details: verification };
    } catch (err) {
      return { verified: false, method: "txhash", error: `On-chain verification error: ${err.message}` };
    }
  }

  // ── proof (quote-based) verification ──
  if (method === "proof") {
    if (parts.length < 6) {
      return { verified: false, error: "Invalid proof format. Expected x402:proof:<quoteId>:<amount>:<currency>:<network>" };
    }
    const [, , quoteId, amount, currency, network] = parts;
    const quoteCheck = validateQuote(quoteId, {
      expectedAmount: amount,
      expectedCurrency: currency,
    });
    if (!quoteCheck.valid) {
      return { verified: false, method: "proof", error: quoteCheck.error };
    }
    // Amount in the header must be sufficient for the service price
    if (parseFloat(amount) < parseFloat(expectedAmount)) {
      return { verified: false, method: "proof", error: `Insufficient amount: required ${expectedAmount}, provided ${amount}` };
    }
    return { verified: true, method: "proof", quoteId, amount, currency, network, quote: quoteCheck.quote };
  }

  return { verified: false, error: `Unknown payment method: ${method}. Supported: txhash, proof` };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Read the full request body and parse as JSON.
 * Returns an empty object for requests with no body.
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send a JSON response with the given status code.
 */
function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "X-Agent-Protocol": "x402/1.0",
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * Match a URL path against a pattern with named params, e.g. "/services/:name/quote".
 * Returns an object of matched params or null if no match.
 */
function matchRoute(pattern, pathname) {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ─── Service Registry (in-memory, populated from Orchestrator) ──

/**
 * Build the local service catalog from the orchestrator's service agents.
 * Maps friendly names to agent instances and metadata.
 */
function buildServiceCatalog(orchestrator) {
  const catalog = {};

  if (orchestrator.swapOptimizer) {
    catalog["swap-optimizer"] = {
      name: "SwapOptimizer",
      description:
        "Compares OnchainOS DEX (500+ sources) and Uniswap routing to find optimal swap paths.",
      pricePerCall: "0.01",
      currency: "USDT",
      agent: orchestrator.swapOptimizer,
      requiredParams: ["fromToken", "toToken", "amount"],
    };
  }

  if (orchestrator.tokenScanner) {
    catalog["token-scanner"] = {
      name: "TokenScanner",
      description:
        "Comprehensive security analysis for tokens and contracts on X Layer.",
      pricePerCall: "0.005",
      currency: "USDT",
      agent: orchestrator.tokenScanner,
      requiredParams: ["tokenAddress"],
    };
  }

  if (orchestrator.priceAlert) {
    catalog["price-alert"] = {
      name: "PriceAlert",
      description:
        "Real-time price monitoring for X Layer tokens with configurable alerts.",
      pricePerCall: "0.002",
      currency: "USDT",
      agent: orchestrator.priceAlert,
      requiredParams: ["tokenAddress", "targetPrice"],
    };
  }

  return catalog;
}

// ─── Route Handlers ──────────────────────────────────────────

function handleHealth(_req, res, orchestrator) {
  const status = orchestrator.getStatus();
  sendJson(res, 200, {
    status: "ok",
    agent: status.agent,
    initialized: status.initialized,
    uptime: status.uptime,
    timestamp: Date.now(),
  });
}

function handleAgentProfile(_req, res, orchestrator) {
  const status = orchestrator.getStatus();
  sendJson(res, 200, {
    agent: status.agent,
    wallet: status.wallet,
    services: Object.keys(status.services),
    totalActions: status.totalActions,
    modules: status.modules,
    uptime: status.uptime,
    protocol: "x402/1.0",
  });
}

function handleListServices(_req, res, _orchestrator, catalog) {
  const services = Object.entries(catalog).map(([slug, svc]) => ({
    slug,
    name: svc.name,
    description: svc.description,
    pricePerCall: svc.pricePerCall,
    currency: svc.currency,
    requiredParams: svc.requiredParams,
    endpoint: `/services/${slug}/execute`,
    quoteEndpoint: `/services/${slug}/quote`,
  }));

  sendJson(res, 200, { services, count: services.length, timestamp: Date.now() });
}

async function handleQuote(req, res, orchestrator, catalog, params) {
  const svc = catalog[params.name];
  if (!svc) {
    sendJson(res, 404, { error: "Service not found", service: params.name });
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  // Check required params
  const missing = svc.requiredParams.filter((p) => !(p in body));
  if (missing.length > 0) {
    sendJson(res, 400, {
      error: "Missing required parameters",
      missing,
      required: svc.requiredParams,
    });
    return;
  }

  // Return a quote with x402 payment details and store it for later verification
  const quoteId = `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Date.now() + 300000; // 5 minutes

  storeQuote(quoteId, {
    amount: svc.pricePerCall,
    currency: svc.currency,
    service: svc.name,
    params: body,
    expiresAt,
  });

  sendJson(res, 200, {
    quoteId,
    service: svc.name,
    slug: params.name,
    pricePerCall: svc.pricePerCall,
    currency: svc.currency,
    params: body,
    paymentDetails: {
      protocol: "x402",
      recipient: orchestrator.walletAddress || "agent-wallet-address",
      amount: svc.pricePerCall,
      currency: svc.currency,
      network: "xlayer",
      memo: `Service call: ${svc.name}`,
    },
    expiresAt,
    timestamp: Date.now(),
  });
}

async function handleExecute(req, res, orchestrator, catalog, params) {
  const svc = catalog[params.name];
  if (!svc) {
    sendJson(res, 404, { error: "Service not found", service: params.name });
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  // Check required params
  const missing = svc.requiredParams.filter((p) => !(p in body));
  if (missing.length > 0) {
    sendJson(res, 400, {
      error: "Missing required parameters",
      missing,
      required: svc.requiredParams,
    });
    return;
  }

  // Verify x402 payment header
  const paymentHeader = req.headers["x-402-payment"];
  if (!paymentHeader) {
    // Return 402 Payment Required with payment instructions
    sendJson(
      res,
      402,
      {
        error: "Payment required",
        message: "Include x402 payment proof in the X-402-Payment header",
        paymentDetails: {
          protocol: "x402",
          recipient: orchestrator.walletAddress || "agent-wallet-address",
          amount: svc.pricePerCall,
          currency: svc.currency,
          network: "xlayer",
          memo: `Service call: ${svc.name}`,
        },
        quoteEndpoint: `/services/${params.name}/quote`,
      },
      {
        "X-402-Price": svc.pricePerCall,
        "X-402-Currency": svc.currency,
        "X-402-Network": "xlayer",
        "X-402-Recipient": orchestrator.walletAddress || "agent-wallet-address",
      }
    );
    return;
  }

  // Parse and verify the payment header
  const paymentVerification = await verifyPaymentHeader(paymentHeader, {
    onchainos: orchestrator.onchainos || orchestrator,
    recipientAddress: orchestrator.walletAddress || "agent-wallet-address",
    expectedAmount: svc.pricePerCall,
    expectedCurrency: svc.currency,
  });

  if (!paymentVerification.verified) {
    sendJson(res, 402, {
      error: "Payment verification failed",
      message: paymentVerification.error,
      method: paymentVerification.method || null,
      details: paymentVerification.details || null,
      paymentDetails: {
        protocol: "x402",
        recipient: orchestrator.walletAddress || "agent-wallet-address",
        amount: svc.pricePerCall,
        currency: svc.currency,
        network: "xlayer",
      },
      quoteEndpoint: `/services/${params.name}/quote`,
    });
    return;
  }

  // Execute the service agent with paymentVerified flag
  try {
    const executeParams = {
      ...body,
      callerAddress: body.callerAddress || req.headers["x-caller-address"] || "0x0000000000000000000000000000000000000000",
      paymentVerified: true,
      paymentTxHash: paymentVerification.txHash || null,
    };

    const result = await svc.agent.execute(executeParams);

    sendJson(res, 200, {
      success: true,
      service: svc.name,
      result,
      payment: {
        verified: true,
        method: paymentVerification.method,
        amount: svc.pricePerCall,
        currency: svc.currency,
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      service: svc.name,
      error: err.message,
      timestamp: Date.now(),
    });
  }
}

// ─── Server Factory ──────────────────────────────────────────

/**
 * Create and return an HTTP server bound to the given orchestrator.
 *
 * @param {Orchestrator} orchestrator - Initialized orchestrator instance
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.port] - Port to listen on (default: 3402, a nod to x402)
 * @returns {{ server: http.Server, start: Function, stop: Function }}
 */
export function createAgentServer(orchestrator, options = {}) {
  const port = options.port || 3402;
  const catalog = buildServiceCatalog(orchestrator);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method.toUpperCase();

    try {
      // ── GET /health ──
      if (method === "GET" && pathname === "/health") {
        return handleHealth(req, res, orchestrator);
      }

      // ── GET /agent/profile ──
      if (method === "GET" && pathname === "/agent/profile") {
        return handleAgentProfile(req, res, orchestrator);
      }

      // ── GET /services ──
      if (method === "GET" && pathname === "/services") {
        return handleListServices(req, res, orchestrator, catalog);
      }

      // ── POST /services/:name/quote ──
      const quoteParams = matchRoute("/services/:name/quote", pathname);
      if (method === "POST" && quoteParams) {
        return await handleQuote(req, res, orchestrator, catalog, quoteParams);
      }

      // ── POST /services/:name/execute ──
      const execParams = matchRoute("/services/:name/execute", pathname);
      if (method === "POST" && execParams) {
        return await handleExecute(req, res, orchestrator, catalog, execParams);
      }

      // ── 404 ──
      sendJson(res, 404, {
        error: "Not found",
        availableEndpoints: [
          "GET  /health",
          "GET  /agent/profile",
          "GET  /services",
          "POST /services/:name/quote",
          "POST /services/:name/execute",
        ],
      });
    } catch (err) {
      console.error("[AgentServer] Unhandled error:", err);
      sendJson(res, 500, { error: "Internal server error", message: err.message });
    }
  });

  return {
    server,

    /**
     * Start listening. Returns a Promise that resolves once the server is ready.
     */
    start() {
      return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, () => {
          const addr = server.address();
          console.log(`[AgentServer] Listening on http://localhost:${addr.port}`);
          console.log(`[AgentServer] Services exposed: ${Object.keys(catalog).join(", ")}`);
          console.log(`[AgentServer] Protocol: x402/1.0`);
          resolve(addr);
        });
      });
    },

    /**
     * Gracefully stop the server.
     */
    stop() {
      return new Promise((resolve) => {
        server.close(() => {
          console.log("[AgentServer] Server stopped");
          resolve();
        });
      });
    },
  };
}

export default createAgentServer;
export { verifyPaymentHeader, storeQuote, validateQuote, quoteStore };
