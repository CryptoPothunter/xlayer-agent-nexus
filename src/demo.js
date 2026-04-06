/**
 * X Layer Agent Nexus - Demo Script
 * Demonstrates the full agent lifecycle:
 * 1. Initialize all modules
 * 2. Register agent on marketplace
 * 3. Process various commands
 * 4. Show agent-to-agent interactions
 */
import { Orchestrator } from "./agents/orchestrator.js";
import { createAgentServer } from "./core/agent-server.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║       X Layer Agent Nexus — Live Demo            ║
  ║   Autonomous Agent-to-Agent Service Marketplace  ║
  ╚══════════════════════════════════════════════════╝
  `);

  // Initialize the orchestrator
  const agent = new Orchestrator({
    rpcUrl: process.env.XLAYER_RPC || "https://rpc.xlayer.tech",
    privateKey: process.env.PRIVATE_KEY,
    onchainosApiKey: process.env.OKX_API_KEY,
    onchainosSecretKey: process.env.OKX_SECRET_KEY,
    onchainosPassphrase: process.env.OKX_PASSPHRASE,
    onchainosProjectId: process.env.OKX_PROJECT_ID,
    registryAddress: process.env.SERVICE_REGISTRY_ADDRESS,
    agentName: process.env.AGENT_NAME || "NexusOrchestrator",
  });

  await agent.initialize();

  // ── Demo Scenario 1: Agent Status ──
  console.log("\n━━━ Demo 1: Agent Status Dashboard ━━━");
  const status = agent.getStatus();
  console.log(JSON.stringify(status, null, 2));

  // ── Demo Scenario 2: Natural Language → Swap Optimization ──
  console.log("\n━━━ Demo 2: Swap Optimization ━━━");
  console.log('User says: "swap 100 USDT to ETH"');
  const swapResult = await agent.processMessage("swap 100 USDT to ETH");
  console.log("\nResult:", JSON.stringify(swapResult.summary, null, 2));

  // ── Demo Scenario 3: Security Scan ──
  console.log("\n━━━ Demo 3: Token Security Scan ━━━");
  console.log('User says: "scan token USDT for security"');
  const scanResult = await agent.processMessage("scan token USDT for security risks");
  console.log("\nResult:", JSON.stringify(scanResult.summary, null, 2));

  // ── Demo Scenario 4: Service Discovery ──
  console.log("\n━━━ Demo 4: Marketplace Service Discovery ━━━");
  console.log('User says: "find available services"');
  const discoverResult = await agent.processMessage("find available services on marketplace");
  console.log("\nResult:", JSON.stringify(discoverResult.summary, null, 2));

  // ── Demo Scenario 5: Portfolio Check ──
  console.log("\n━━━ Demo 5: Balance Check ━━━");
  console.log('User says: "check my balance"');
  const balanceResult = await agent.processMessage("check my balance");
  console.log("\nResult:", JSON.stringify(balanceResult.summary, null, 2));

  // ── Demo Scenario 6: Price Intelligence ──
  console.log("\n━━━ Demo 6: Price Intelligence ━━━");
  console.log('User says: "what is the price of OKB"');
  const priceResult = await agent.processMessage("price of OKB");
  console.log("\nResult:", JSON.stringify(priceResult.summary, null, 2));

  // ── Demo Scenario 7: Agent-to-Agent Interaction ──
  console.log("\n━━━ Demo 7: Agent-to-Agent Service Call ━━━");
  console.log("SwapOptimizer agent processing request from another agent...");
  const a2aResult = await agent.swapOptimizer.execute({
    fromToken: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", // USDT
    toToken: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c",   // WETH
    amount: "100000000", // 100 USDT (6 decimals)
    callerAddress: "0x0000000000000000000000000000000000000001", // Simulated caller
  });
  console.log("\nSwap Optimization Result:");
  console.log(`  Routes found: ${a2aResult.routes.length}`);
  if (a2aResult.recommendation) {
    console.log(`  Best route: ${a2aResult.recommendation.source}`);
    console.log(`  Advantage: ${a2aResult.recommendation.advantage}`);
  }

  // ── Demo Scenario 8: Agent-to-Agent HTTP Communication ──
  console.log("\n━━━ Demo 8: Agent-to-Agent HTTP Communication ━━━");
  console.log("Starting agent HTTP server for real network-based service calls...\n");

  const serverPort = 3402;
  const agentServer = createAgentServer(agent, { port: serverPort });
  await agentServer.start();

  const BASE_URL = `http://localhost:${serverPort}`;

  try {
    // Step 1: Health check
    console.log("─── Step 1: Health Check ───");
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    console.log(`  Status: ${healthData.status}`);
    console.log(`  Agent: ${healthData.agent}`);
    console.log(`  Uptime: ${healthData.uptime}ms\n`);

    // Step 2: Discover available services
    console.log("─── Step 2: Discover Services (GET /services) ───");
    const servicesRes = await fetch(`${BASE_URL}/services`);
    const servicesData = await servicesRes.json();
    console.log(`  Found ${servicesData.count} services:`);
    for (const svc of servicesData.services) {
      console.log(`    - ${svc.name} (${svc.slug}): ${svc.pricePerCall} ${svc.currency}/call`);
      console.log(`      Params: ${svc.requiredParams.join(", ")}`);
    }
    console.log();

    // Step 3: Get agent profile
    console.log("─── Step 3: Agent Profile (GET /agent/profile) ───");
    const profileRes = await fetch(`${BASE_URL}/agent/profile`);
    const profileData = await profileRes.json();
    console.log(`  Agent: ${profileData.agent}`);
    console.log(`  Protocol: ${profileData.protocol}`);
    console.log(`  Services: ${profileData.services.join(", ")}\n`);

    // Step 4: Request a quote for TokenScanner
    console.log("─── Step 4: Get Quote (POST /services/token-scanner/quote) ───");
    const quoteRes = await fetch(`${BASE_URL}/services/token-scanner/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenAddress: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      }),
    });
    const quoteData = await quoteRes.json();
    console.log(`  Quote ID: ${quoteData.quoteId}`);
    console.log(`  Price: ${quoteData.pricePerCall} ${quoteData.currency}`);
    console.log(`  Payment protocol: ${quoteData.paymentDetails.protocol}`);
    console.log(`  Expires: ${new Date(quoteData.expiresAt).toISOString()}\n`);

    // Step 5: Execute without payment — expect 402
    console.log("─── Step 5: Execute Without Payment (expect HTTP 402) ───");
    const noPayRes = await fetch(`${BASE_URL}/services/token-scanner/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenAddress: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      }),
    });
    console.log(`  HTTP Status: ${noPayRes.status} (${noPayRes.status === 402 ? "Payment Required — correct!" : "unexpected"})`);
    const noPayData = await noPayRes.json();
    console.log(`  Message: ${noPayData.message}`);
    console.log(`  Required amount: ${noPayData.paymentDetails?.amount} ${noPayData.paymentDetails?.currency}`);
    // Show x402 headers
    const priceHeader = noPayRes.headers.get("x-402-price");
    if (priceHeader) {
      console.log(`  X-402-Price header: ${priceHeader}`);
      console.log(`  X-402-Currency header: ${noPayRes.headers.get("x-402-currency")}`);
      console.log(`  X-402-Network header: ${noPayRes.headers.get("x-402-network")}`);
    }
    console.log();

    // Step 6: Execute with payment proof — full service call
    console.log("─── Step 6: Execute With Payment (POST /services/token-scanner/execute) ───");
    const execRes = await fetch(`${BASE_URL}/services/token-scanner/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": `x402:proof:${quoteData.quoteId}:0.005:USDT:xlayer`,
        "X-Caller-Address": "0x0000000000000000000000000000000000000001",
      },
      body: JSON.stringify({
        tokenAddress: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      }),
    });
    const execData = await execRes.json();
    console.log(`  HTTP Status: ${execRes.status}`);
    console.log(`  Success: ${execData.success}`);
    console.log(`  Service: ${execData.service}`);
    if (execData.result) {
      console.log(`  Risk Level: ${execData.result.riskLevel || "N/A"}`);
      console.log(`  Risk Score: ${execData.result.riskScore ?? "N/A"}`);
      console.log(`  Recommendation: ${execData.result.recommendation || "N/A"}`);
    }
    console.log(`  Payment received: ${execData.payment?.received ? "yes" : "no"}\n`);

    // Step 7: Demonstrate 404 for unknown service
    console.log("─── Step 7: Unknown Service (expect 404) ───");
    const unknownRes = await fetch(`${BASE_URL}/services/nonexistent/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-402-Payment": "x402:proof:test",
      },
      body: JSON.stringify({}),
    });
    const unknownData = await unknownRes.json();
    console.log(`  HTTP Status: ${unknownRes.status}`);
    console.log(`  Error: ${unknownData.error}\n`);

    console.log("Agent-to-agent HTTP communication demo complete.");
    console.log("The full request/response cycle works: discover -> quote -> pay -> execute\n");
  } finally {
    await agentServer.stop();
  }

  // ── Summary ──
  console.log("\n━━━ Demo Complete ━━━");
  const finalStatus = agent.getStatus();
  console.log(`Total actions performed: ${finalStatus.totalActions}`);
  console.log(`Services available: ${Object.keys(finalStatus.services).length}`);
  console.log(`Swap Optimizer calls: ${finalStatus.services.swapOptimizer?.totalCalls || 0}`);
  console.log(`Token Scanner calls: ${finalStatus.services.tokenScanner?.totalCalls || 0}`);
  console.log(`Price Alert calls: ${finalStatus.services.priceAlert?.totalCalls || 0}`);

  await agent.shutdown();
}

main().catch(console.error);
