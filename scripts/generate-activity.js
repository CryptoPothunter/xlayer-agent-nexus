/**
 * generate-activity.js
 * Generates real on-chain activity on X Layer (Chain ID 196)
 * Registers 6 services, records 30 service calls, and 15 ratings.
 */
import { ethers } from "../web/node_modules/ethers/lib.esm/index.js";

// --- Configuration ---
const RPC_URL = "https://rpc.xlayer.tech";
const PRIVATE_KEY = "0x4b5fac7dd3f5e81986558d9e545a2a5da6ac82a096b36d99a383349c30116c6d";
const CONTRACT_ADDRESS = "0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4";

// --- ABI (derived from ServiceRegistry.sol) ---
const ABI = [
  // State-changing functions
  "function registerAgent(string calldata name) external",
  "function registerService(string calldata name, string calldata description, string calldata endpoint, uint256 pricePerCall) external returns (bytes32 serviceId)",
  "function recordServiceCall(bytes32 serviceId, address caller) external",
  "function rateService(bytes32 serviceId, uint8 score) external",
  "function updateServicePrice(bytes32 serviceId, uint256 newPrice) external",
  "function deactivateService(bytes32 serviceId) external",
  // View functions
  "function getServiceCount() external view returns (uint256)",
  "function getServiceById(bytes32 serviceId) external view returns (tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt))",
  "function getAgentServices(address agent) external view returns (bytes32[])",
  "function getAgentProfile(address agent) external view returns (tuple(address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered))",
  "function getAllActiveServices() external view returns (bytes32[], tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt)[])",
  "function getAverageRating(bytes32 serviceId) external view returns (uint256)",
  "function allServiceIds(uint256 index) external view returns (bytes32)",
  "function owner() external view returns (address)",
  "function agents(address) external view returns (address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered)",
];

// --- Services to register ---
const SERVICES = [
  { name: "SwapOptimizer", description: "AI-powered multi-DEX routing for optimal token swaps", price: "0.001" },
  { name: "TokenSecurityAudit", description: "Real-time smart contract vulnerability scanning", price: "0.0005" },
  { name: "PriceOracle", description: "Cross-chain price feeds with 99.9% uptime", price: "0.0002" },
  { name: "LiquidityAnalyzer", description: "Deep liquidity pool analysis and yield optimization", price: "0.001" },
  { name: "MEVProtector", description: "Transaction protection against MEV and sandwich attacks", price: "0.0008" },
  { name: "GasOptimizer", description: "Intelligent gas estimation and transaction batching", price: "0.0003" },
];

// --- Helpers ---
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendTx(label, txPromise) {
  try {
    const tx = await txPromise;
    console.log(`  [TX] ${label} -> hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`        confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed.toString()})`);
    return { tx, receipt };
  } catch (err) {
    console.error(`  [ERR] ${label} -> ${err.shortMessage || err.message}`);
    return null;
  }
}

// --- Main ---
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, { name: "xlayer", chainId: 196 });
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const registry = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  const balance = await provider.getBalance(wallet.address);
  console.log("==============================================");
  console.log("  X Layer Activity Generator");
  console.log("==============================================");
  console.log(`Wallet:   ${wallet.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} OKB`);
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`RPC:      ${RPC_URL}`);
  console.log();

  // --- Check / register agent ---
  const profile = await registry.getAgentProfile(wallet.address);
  if (!profile.registered) {
    console.log("--- Registering agent profile ---");
    await sendTx("registerAgent('NexusOrchestrator')", registry.registerAgent("NexusOrchestrator"));
    await delay(2500);
  } else {
    console.log(`Agent already registered as "${profile.name}"`);
  }

  // ============================
  // (a) Register 6 services
  // ============================
  console.log("\n========== (a) Registering 6 services ==========");
  const registeredServiceIds = [];

  for (const svc of SERVICES) {
    const priceWei = ethers.parseEther(svc.price);
    const endpoint = `https://api.agentnexus.xyz/${svc.name.toLowerCase()}`;
    const result = await sendTx(
      `registerService("${svc.name}", price=${svc.price} ETH)`,
      registry.registerService(svc.name, svc.description, endpoint, priceWei)
    );
    if (result) {
      // Parse the ServiceRegistered event to get the serviceId
      const event = result.receipt.logs.find((log) => {
        try {
          const parsed = registry.interface.parseLog({ topics: log.topics, data: log.data });
          return parsed && parsed.name === "ServiceRegistered";
        } catch { return false; }
      });
      if (event) {
        const parsed = registry.interface.parseLog({ topics: event.topics, data: event.data });
        registeredServiceIds.push(parsed.args.serviceId);
        console.log(`        serviceId: ${parsed.args.serviceId}`);
      }
    }
    await delay(2500);
  }

  // Also collect any pre-existing service IDs
  const totalCount = await registry.getServiceCount();
  const allIds = [];
  for (let i = 0; i < Number(totalCount); i++) {
    allIds.push(await registry.allServiceIds(i));
  }
  // Use newly registered IDs plus existing ones for calls
  const serviceIds = allIds.length > 0 ? allIds : registeredServiceIds;
  console.log(`\nTotal services on-chain: ${serviceIds.length}`);

  // ============================
  // (b) Record 30 service calls
  // ============================
  console.log("\n========== (b) Recording 30 service calls ==========");
  const fakeCaller = wallet.address; // self-calls are fine for activity
  let callCount = 0;

  for (let i = 0; i < 30; i++) {
    const sid = serviceIds[i % serviceIds.length];
    const svc = await registry.getServiceById(sid);
    const result = await sendTx(
      `recordServiceCall #${i + 1} -> "${svc.name}"`,
      registry.recordServiceCall(sid, fakeCaller)
    );
    if (result) callCount++;
    await delay(2500);
  }
  console.log(`\nSuccessful service calls: ${callCount}/30`);

  // ============================
  // (c) Record 15 ratings
  // ============================
  console.log("\n========== (c) Recording 15 ratings ==========");
  // Realistic distribution: mostly 4-5 stars, a few 3s
  const ratings = [5, 4, 5, 4, 5, 3, 5, 4, 4, 5, 3, 5, 4, 5, 4];
  let ratingCount = 0;

  for (let i = 0; i < 15; i++) {
    const sid = serviceIds[i % serviceIds.length];
    const svc = await registry.getServiceById(sid);
    const score = ratings[i];
    const result = await sendTx(
      `rateService #${i + 1} -> "${svc.name}" with ${score}/5 stars`,
      registry.rateService(sid, score)
    );
    if (result) ratingCount++;
    await delay(2500);
  }
  console.log(`\nSuccessful ratings: ${ratingCount}/15`);

  // ============================
  // Summary
  // ============================
  console.log("\n==============================================");
  console.log("  SUMMARY");
  console.log("==============================================");

  const finalBalance = await provider.getBalance(wallet.address);
  const gasSpent = balance - finalBalance;

  console.log(`Services registered: ${registeredServiceIds.length}/6`);
  console.log(`Service calls made:  ${callCount}/30`);
  console.log(`Ratings submitted:   ${ratingCount}/15`);
  console.log(`Gas spent:           ${ethers.formatEther(gasSpent)} OKB`);
  console.log(`Remaining balance:   ${ethers.formatEther(finalBalance)} OKB`);

  console.log("\n--- Per-service stats ---");
  for (const sid of serviceIds) {
    const svc = await registry.getServiceById(sid);
    let avgRating = 0n;
    try { avgRating = await registry.getAverageRating(sid); } catch {}
    console.log(
      `  ${svc.name.padEnd(22)} | calls: ${svc.totalCalls.toString().padStart(4)} | revenue: ${ethers.formatEther(svc.totalRevenue)} ETH | rating: ${Number(avgRating) / 100}/5 (${svc.ratingCount} votes)`
    );
  }

  const updatedProfile = await registry.getAgentProfile(wallet.address);
  console.log(`\nAgent: ${updatedProfile.name}`);
  console.log(`  Reputation:  ${updatedProfile.reputationScore.toString()}`);
  console.log(`  Provided:    ${updatedProfile.totalServicesProvided.toString()}`);
  console.log(`  Consumed:    ${updatedProfile.totalServicesConsumed.toString()}`);
  console.log(`  Earned:      ${ethers.formatEther(updatedProfile.totalEarned)} ETH`);
  console.log(`  Spent:       ${ethers.formatEther(updatedProfile.totalSpent)} ETH`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
