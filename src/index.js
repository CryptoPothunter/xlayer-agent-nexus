/**
 * X Layer Agent Nexus - Main Entry Point
 * Interactive CLI for the agent marketplace
 */
import { Orchestrator } from "./agents/orchestrator.js";
import { createInterface } from "readline";
import dotenv from "dotenv";

dotenv.config();

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     ██╗  ██╗    ██╗      █████╗ ██╗   ██╗███████╗██████╗    ║
║     ╚██╗██╔╝    ██║     ██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗   ║
║      ╚███╔╝     ██║     ███████║ ╚████╔╝ █████╗  ██████╔╝   ║
║      ██╔██╗     ██║     ██╔══██║  ╚██╔╝  ██╔══╝  ██╔══██╗   ║
║     ██╔╝ ██╗    ███████╗██║  ██║   ██║   ███████╗██║  ██║   ║
║     ╚═╝  ╚═╝    ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ║
║                                                              ║
║           AGENT NEXUS — Service Marketplace                  ║
║       Autonomous Agent-to-Agent Economy on X Layer           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);

  const agent = new Orchestrator({
    rpcUrl: process.env.XLAYER_RPC || "https://rpc.xlayer.tech",
    privateKey: process.env.PRIVATE_KEY,
    onchainosApiKey: process.env.ONCHAINOS_API_KEY,
    onchainosProjectId: process.env.ONCHAINOS_PROJECT_ID,
    registryAddress: process.env.SERVICE_REGISTRY_ADDRESS,
    agentName: process.env.AGENT_NAME || "NexusOrchestrator",
  });

  await agent.initialize();

  // Interactive REPL
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n🤖 Agent Nexus > ",
  });

  console.log('Type a command in natural language, or "help" to see options.');
  console.log('Type "status" for dashboard, "quit" to exit.\n');

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") {
      await agent.shutdown();
      rl.close();
      process.exit(0);
    }

    if (input.toLowerCase() === "register") {
      await agent.registerOnMarketplace();
      rl.prompt();
      return;
    }

    try {
      const result = await agent.processMessage(input);
      console.log("\n─── Result ───");

      // Print summary
      if (result.summary) {
        console.log(
          `Intent: ${result.summary.intent} | Steps: ${result.summary.succeeded}/${result.summary.totalSteps} succeeded`
        );
      }

      // Print notable data from results
      for (const r of result.results) {
        if (r.success && r.data) {
          if (r.step === "get_balances" && Array.isArray(r.data)) {
            console.log("\nToken Balances:");
            for (const b of r.data.slice(0, 10)) {
              console.log(`  ${b.symbol || b.tokenSymbol || "?"}: ${b.balance || b.amount || "0"}`);
            }
          } else if (r.step === "compare_routes" && r.data.best) {
            console.log(`\nBest Route: ${r.data.best.source}`);
            console.log(`Comparison: ${r.data.comparison}`);
          } else if (r.step === "token_scan" || r.step === "security_scan") {
            if (r.data.riskLevel) {
              console.log(`\nRisk Level: ${r.data.riskLevel.toUpperCase()}`);
              console.log(`Risk Score: ${r.data.riskScore}/100`);
              console.log(`Recommendation: ${r.data.recommendation}`);
              if (r.data.warnings?.length) {
                console.log("Warnings:");
                r.data.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
              }
            }
          } else if (r.step === "show_help") {
            console.log(`\n${r.data.title}: ${r.data.description}`);
            console.log("\nAvailable commands:");
            r.data.commands.forEach((c) => {
              console.log(`  "${c.example}" — ${c.description}`);
            });
          }
        }
      }
    } catch (e) {
      console.error("Error:", e.message);
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    await agent.shutdown();
  });
}

main().catch(console.error);
