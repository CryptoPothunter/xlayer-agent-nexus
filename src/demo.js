/**
 * X Layer Agent Nexus - Demo Script
 * Demonstrates the full agent lifecycle:
 * 1. Initialize all modules
 * 2. Register agent on marketplace
 * 3. Process various commands
 * 4. Show agent-to-agent interactions
 */
import { Orchestrator } from "./agents/orchestrator.js";
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
    onchainosApiKey: process.env.ONCHAINOS_API_KEY,
    onchainosProjectId: process.env.ONCHAINOS_PROJECT_ID,
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
