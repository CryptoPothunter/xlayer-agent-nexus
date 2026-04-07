/**
 * generate-multi-wallet-activity.js
 * Simulates a multi-party ecosystem on X Layer (Chain ID 196).
 * Creates 2 additional wallets, funds them, registers services, and makes cross-agent calls.
 */
import { ethers } from "../web/node_modules/ethers/lib.esm/index.js";

// --- Configuration ---
const RPC_URL = "https://rpc.xlayer.tech";
const MAIN_PRIVATE_KEY = "0x4b5fac7dd3f5e81986558d9e545a2a5da6ac82a096b36d99a383349c30116c6d";
const CONTRACT_ADDRESS = "0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4";
const FUND_AMOUNT = "0.005"; // OKB to send to each sub-wallet

// --- ABI (same as generate-activity.js) ---
const ABI = [
  "function registerAgent(string calldata name) external",
  "function registerService(string calldata name, string calldata description, string calldata endpoint, uint256 pricePerCall) external returns (bytes32 serviceId)",
  "function recordServiceCall(bytes32 serviceId, address caller) external",
  "function rateService(bytes32 serviceId, uint8 score) external",
  "function updateServicePrice(bytes32 serviceId, uint256 newPrice) external",
  "function getServiceCount() external view returns (uint256)",
  "function getServiceById(bytes32 serviceId) external view returns (tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt))",
  "function getAgentServices(address agent) external view returns (bytes32[])",
  "function getAgentProfile(address agent) external view returns (tuple(address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered))",
  "function getAverageRating(bytes32 serviceId) external view returns (uint256)",
  "function allServiceIds(uint256 index) external view returns (bytes32)",
  "function owner() external view returns (address)",
];

// --- Sub-wallet service definitions ---
const WALLET_CONFIGS = [
  {
    agentName: "AlphaTrader",
    services: [
      { name: "SentimentScanner", description: "NLP-based crypto sentiment analysis from social feeds", price: "0.0004" },
      { name: "WhaleTracker", description: "Real-time large wallet movement alerts and analytics", price: "0.0006" },
    ],
  },
  {
    agentName: "DeFiGuardian",
    services: [
      { name: "RugPullDetector", description: "ML-powered rug pull probability scoring for new tokens", price: "0.0007" },
      { name: "YieldComparator", description: "Cross-protocol yield comparison and auto-rebalancing signals", price: "0.0005" },
    ],
  },
];

// --- Helpers ---
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendTx(label, txPromise) {
  try {
    const tx = await txPromise;
    console.log(`  [TX] ${label} -> hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`        confirmed block ${receipt.blockNumber} (gas: ${receipt.gasUsed.toString()})`);
    return { tx, receipt };
  } catch (err) {
    console.error(`  [ERR] ${label} -> ${err.shortMessage || err.message}`);
    return null;
  }
}

function deriveWallets(mainKey, count) {
  // Deterministic derivation: hash the main key with an index to produce child keys
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const seed = ethers.keccak256(ethers.solidityPacked(["bytes32", "uint256"], [mainKey, i + 1]));
    wallets.push(new ethers.Wallet(seed));
  }
  return wallets;
}

// --- Main ---
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "xlayer", chainId: 196 });
  const mainWallet = new ethers.Wallet(MAIN_PRIVATE_KEY, provider);
  const mainBalance = await provider.getBalance(mainWallet.address);

  console.log("==============================================");
  console.log("  Multi-Wallet Activity Generator");
  console.log("  X Layer (Chain ID 196)");
  console.log("==============================================");
  console.log(`Main wallet:  ${mainWallet.address}`);
  console.log(`Balance:      ${ethers.formatEther(mainBalance)} OKB`);
  console.log();

  // Derive 2 sub-wallets deterministically
  const subWallets = deriveWallets(MAIN_PRIVATE_KEY, 2).map((w) => w.connect(provider));

  for (let i = 0; i < subWallets.length; i++) {
    const bal = await provider.getBalance(subWallets[i].address);
    console.log(`Sub-wallet ${i + 1} (${WALLET_CONFIGS[i].agentName}): ${subWallets[i].address} | ${ethers.formatEther(bal)} OKB`);
  }
  console.log();

  // ============================
  // Step 1: Fund sub-wallets
  // ============================
  console.log("========== Step 1: Funding sub-wallets ==========");
  for (let i = 0; i < subWallets.length; i++) {
    const bal = await provider.getBalance(subWallets[i].address);
    const threshold = ethers.parseEther("0.003");
    if (bal >= threshold) {
      console.log(`  Sub-wallet ${i + 1} already has sufficient funds (${ethers.formatEther(bal)} OKB), skipping.`);
      continue;
    }
    const result = await sendTx(
      `Fund sub-wallet ${i + 1} (${WALLET_CONFIGS[i].agentName}) with ${FUND_AMOUNT} OKB`,
      mainWallet.sendTransaction({
        to: subWallets[i].address,
        value: ethers.parseEther(FUND_AMOUNT),
      })
    );
    if (!result) {
      console.error(`  FATAL: Could not fund sub-wallet ${i + 1}. Aborting.`);
      process.exit(1);
    }
    await delay(3000);
  }

  // ============================
  // Step 2: Register agents and services for each sub-wallet
  // ============================
  console.log("\n========== Step 2: Register agents & services ==========");
  const allNewServiceIds = []; // { walletIndex, serviceId, name }

  for (let i = 0; i < subWallets.length; i++) {
    const w = subWallets[i];
    const cfg = WALLET_CONFIGS[i];
    const registry = new ethers.Contract(CONTRACT_ADDRESS, ABI, w);

    // Register agent
    const profile = await registry.getAgentProfile(w.address);
    if (!profile.registered) {
      console.log(`\n--- Registering agent "${cfg.agentName}" (wallet ${i + 1}) ---`);
      await sendTx(`registerAgent("${cfg.agentName}")`, registry.registerAgent(cfg.agentName));
      await delay(2500);
    } else {
      console.log(`\n  Agent "${cfg.agentName}" already registered.`);
    }

    // Register 2 services
    for (const svc of cfg.services) {
      const priceWei = ethers.parseEther(svc.price);
      const endpoint = `https://api.agentnexus.xyz/${svc.name.toLowerCase()}`;
      const result = await sendTx(
        `registerService("${svc.name}", price=${svc.price} ETH) [${cfg.agentName}]`,
        registry.registerService(svc.name, svc.description, endpoint, priceWei)
      );
      if (result) {
        const event = result.receipt.logs.find((log) => {
          try {
            const parsed = registry.interface.parseLog({ topics: log.topics, data: log.data });
            return parsed && parsed.name === "ServiceRegistered";
          } catch { return false; }
        });
        if (event) {
          const parsed = registry.interface.parseLog({ topics: event.topics, data: event.data });
          allNewServiceIds.push({ walletIndex: i, serviceId: parsed.args.serviceId, name: svc.name });
          console.log(`        serviceId: ${parsed.args.serviceId}`);
        }
      }
      await delay(2500);
    }
  }

  console.log(`\nNewly registered services: ${allNewServiceIds.length}`);

  // ============================
  // Step 3: Cross-agent service calls
  // ============================
  console.log("\n========== Step 3: Cross-agent service calls ==========");
  // Each agent calls the other agents' services, plus the main wallet's services
  // Also the main wallet calls sub-wallet services

  const mainRegistry = new ethers.Contract(CONTRACT_ADDRESS, ABI, mainWallet);

  // Gather all existing service IDs
  const totalCount = Number(await mainRegistry.getServiceCount());
  const allServiceIds = [];
  for (let i = 0; i < totalCount; i++) {
    allServiceIds.push(await mainRegistry.allServiceIds(i));
  }

  let crossCallCount = 0;

  // Main wallet records calls on sub-wallet services (as owner or provider)
  // Sub-wallets record calls on their own services from other agents
  console.log("\n--- Sub-wallet agents calling each other's services ---");
  for (let i = 0; i < subWallets.length; i++) {
    const callerWallet = subWallets[i];
    const otherIndex = (i + 1) % subWallets.length;
    const otherServices = allNewServiceIds.filter((s) => s.walletIndex === otherIndex);

    for (const svcInfo of otherServices) {
      // The provider records the call (provider == subWallets[otherIndex])
      const providerRegistry = new ethers.Contract(CONTRACT_ADDRESS, ABI, subWallets[otherIndex]);
      const result = await sendTx(
        `${WALLET_CONFIGS[otherIndex].agentName} records call from ${WALLET_CONFIGS[i].agentName} on "${svcInfo.name}"`,
        providerRegistry.recordServiceCall(svcInfo.serviceId, callerWallet.address)
      );
      if (result) crossCallCount++;
      await delay(2500);
    }
  }

  // Main wallet calls sub-wallet services (owner can record)
  console.log("\n--- Main wallet calling sub-wallet services ---");
  for (const svcInfo of allNewServiceIds) {
    const result = await sendTx(
      `Main wallet calls "${svcInfo.name}" (owner recordServiceCall)`,
      mainRegistry.recordServiceCall(svcInfo.serviceId, mainWallet.address)
    );
    if (result) crossCallCount++;
    await delay(2500);
  }

  // Sub-wallets call main wallet's pre-existing services (if any exist beyond new ones)
  const mainServiceIds = allServiceIds.filter(
    (sid) => !allNewServiceIds.some((n) => n.serviceId === sid)
  );
  if (mainServiceIds.length > 0) {
    console.log("\n--- Sub-wallets calling main wallet services ---");
    for (let i = 0; i < Math.min(mainServiceIds.length, 4); i++) {
      const sid = mainServiceIds[i % mainServiceIds.length];
      const callerAddr = subWallets[i % subWallets.length].address;
      const result = await sendTx(
        `Main wallet records call from sub-wallet on existing service`,
        mainRegistry.recordServiceCall(sid, callerAddr)
      );
      if (result) crossCallCount++;
      await delay(2500);
    }
  }

  console.log(`\nTotal cross-agent calls: ${crossCallCount}`);

  // ============================
  // Step 4: Cross-agent ratings
  // ============================
  console.log("\n========== Step 4: Cross-agent ratings ==========");
  let ratingCount = 0;

  // Sub-wallets rate each other's services
  for (let i = 0; i < subWallets.length; i++) {
    const raterRegistry = new ethers.Contract(CONTRACT_ADDRESS, ABI, subWallets[i]);
    const otherIndex = (i + 1) % subWallets.length;
    const otherServices = allNewServiceIds.filter((s) => s.walletIndex === otherIndex);

    for (const svcInfo of otherServices) {
      const score = 4 + Math.floor(Math.random() * 2); // 4 or 5
      const result = await sendTx(
        `${WALLET_CONFIGS[i].agentName} rates "${svcInfo.name}" -> ${score}/5`,
        raterRegistry.rateService(svcInfo.serviceId, score)
      );
      if (result) ratingCount++;
      await delay(2500);
    }
  }

  // Sub-wallets rate main wallet services
  if (mainServiceIds.length > 0) {
    for (let i = 0; i < Math.min(mainServiceIds.length, 4); i++) {
      const raterIndex = i % subWallets.length;
      const raterRegistry = new ethers.Contract(CONTRACT_ADDRESS, ABI, subWallets[raterIndex]);
      const score = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
      const result = await sendTx(
        `${WALLET_CONFIGS[raterIndex].agentName} rates main service -> ${score}/5`,
        raterRegistry.rateService(mainServiceIds[i], score)
      );
      if (result) ratingCount++;
      await delay(2500);
    }
  }

  console.log(`\nTotal cross-agent ratings: ${ratingCount}`);

  // ============================
  // Summary
  // ============================
  console.log("\n==============================================");
  console.log("  MULTI-WALLET ACTIVITY SUMMARY");
  console.log("==============================================");

  const finalMainBal = await provider.getBalance(mainWallet.address);
  console.log(`\nMain wallet remaining: ${ethers.formatEther(finalMainBal)} OKB`);
  console.log(`Main wallet gas spent: ${ethers.formatEther(mainBalance - finalMainBal)} OKB`);

  for (let i = 0; i < subWallets.length; i++) {
    const bal = await provider.getBalance(subWallets[i].address);
    const profile = await mainRegistry.getAgentProfile(subWallets[i].address);
    console.log(`\n${WALLET_CONFIGS[i].agentName} (${subWallets[i].address}):`);
    console.log(`  Balance:    ${ethers.formatEther(bal)} OKB`);
    console.log(`  Registered: ${profile.registered}`);
    if (profile.registered) {
      console.log(`  Reputation: ${profile.reputationScore.toString()}`);
      console.log(`  Provided:   ${profile.totalServicesProvided.toString()}`);
      console.log(`  Consumed:   ${profile.totalServicesConsumed.toString()}`);
      console.log(`  Earned:     ${ethers.formatEther(profile.totalEarned)} ETH`);
      console.log(`  Spent:      ${ethers.formatEther(profile.totalSpent)} ETH`);
    }
  }

  // All services summary
  console.log("\n--- All services on-chain ---");
  const finalCount = Number(await mainRegistry.getServiceCount());
  for (let i = 0; i < finalCount; i++) {
    const sid = await mainRegistry.allServiceIds(i);
    const svc = await mainRegistry.getServiceById(sid);
    let avg = 0n;
    try { avg = await mainRegistry.getAverageRating(sid); } catch {}
    console.log(
      `  ${svc.name.padEnd(22)} | provider: ${svc.provider.slice(0, 10)}... | calls: ${svc.totalCalls.toString().padStart(3)} | rating: ${Number(avg) / 100}/5 (${svc.ratingCount} votes)`
    );
  }

  console.log("\nMulti-wallet activity generation complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
