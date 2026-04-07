/**
 * Manual Diverse Activity Generator
 * Generates 10-15 varied on-chain transactions with short delays.
 */
const { ethers } = require("ethers");
require("dotenv").config();

const XLAYER_RPC = "https://rpc.xlayer.tech";
const REGISTRY_ADDRESS = "0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4";
const AGENTIC_WALLET = "0xB84023271ac8fD862C58CD5A6dD45558C3Ba8765";
const DEFI_AGENT = "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18";
const ANALYTICS_AGENT = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
const TRADING_BOT = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30";

const CALLERS = [AGENTIC_WALLET, DEFI_AGENT, ANALYTICS_AGENT, TRADING_BOT];
const CALLER_NAMES = {
  [AGENTIC_WALLET]: "AgenticWallet",
  [DEFI_AGENT]: "DeFiAgent",
  [ANALYTICS_AGENT]: "AnalyticsAgent",
  [TRADING_BOT]: "TradingBot",
};

const ABI = [
  "function recordServiceCall(bytes32 serviceId, address caller) external",
  "function rateService(bytes32 serviceId, uint8 score) external",
  "function updateServicePrice(bytes32 serviceId, uint256 newPrice) external",
  "function allServiceIds(uint256) view returns (bytes32)",
  "function getServiceCount() view returns (uint256)",
  "function getServiceById(bytes32) view returns (tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt))",
  "function getAgentProfile(address) view returns (tuple(address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered))",
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC, { name: "xlayer", chainId: 196 });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, ABI, wallet);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} OKB\n`);

  // Load services
  const count = Number(await registry.getServiceCount());
  const serviceIds = [];
  const serviceNames = {};
  for (let i = 0; i < count; i++) {
    const sid = await registry.allServiceIds(i);
    serviceIds.push(sid);
    const svc = await registry.getServiceById(sid);
    serviceNames[sid] = svc.name;
    console.log(`Service ${i}: ${svc.name} (${svc.totalCalls} calls, price: ${svc.pricePerCall})`);
  }
  console.log("");

  const txHashes = [];
  let txNum = 0;

  // --- Phase 1: recordServiceCall with varied callers (6 txns) ---
  const callPlan = [
    { sid: 0, caller: AGENTIC_WALLET },
    { sid: 1, caller: DEFI_AGENT },
    { sid: 2, caller: ANALYTICS_AGENT },
    { sid: 0, caller: TRADING_BOT },
    { sid: 1, caller: AGENTIC_WALLET },
    { sid: 2, caller: AGENTIC_WALLET },
  ];

  for (const { sid, caller } of callPlan) {
    const serviceId = serviceIds[sid];
    const svcName = serviceNames[serviceId];
    const callerName = CALLER_NAMES[caller];
    try {
      const tx = await registry.recordServiceCall(serviceId, caller);
      const receipt = await tx.wait();
      txNum++;
      txHashes.push(tx.hash);
      console.log(`[${txNum}] CALL ${svcName} <- ${callerName} | tx: ${tx.hash} | block: ${receipt.blockNumber}`);
    } catch (e) {
      console.error(`[ERR] CALL ${svcName}: ${e.message.slice(0, 100)}`);
    }
    await delay(3000);
  }

  // --- Phase 2: rateService with varied scores (5 txns) ---
  const ratePlan = [
    { sid: 0, score: 5 },
    { sid: 1, score: 4 },
    { sid: 2, score: 5 },
    { sid: 0, score: 3 },
    { sid: 1, score: 5 },
  ];

  for (const { sid, score } of ratePlan) {
    const serviceId = serviceIds[sid];
    const svcName = serviceNames[serviceId];
    try {
      const tx = await registry.rateService(serviceId, score);
      const receipt = await tx.wait();
      txNum++;
      txHashes.push(tx.hash);
      console.log(`[${txNum}] RATE ${svcName} -> ${score}/5 | tx: ${tx.hash} | block: ${receipt.blockNumber}`);
    } catch (e) {
      console.error(`[ERR] RATE ${svcName}: ${e.message.slice(0, 100)}`);
    }
    await delay(3000);
  }

  // --- Phase 3: updateServicePrice (2 txns) ---
  const pricePlan = [
    { sid: 0, newPrice: 4500n },
    { sid: 2, newPrice: 600n },
  ];

  for (const { sid, newPrice } of pricePlan) {
    const serviceId = serviceIds[sid];
    const svcName = serviceNames[serviceId];
    try {
      const tx = await registry.updateServicePrice(serviceId, newPrice);
      const receipt = await tx.wait();
      txNum++;
      txHashes.push(tx.hash);
      console.log(`[${txNum}] PRICE ${svcName} -> ${newPrice} | tx: ${tx.hash} | block: ${receipt.blockNumber}`);
    } catch (e) {
      console.error(`[ERR] PRICE ${svcName}: ${e.message.slice(0, 100)}`);
    }
    await delay(3000);
  }

  // --- Phase 4: A few more mixed calls for realism (2 txns) ---
  try {
    const tx1 = await registry.recordServiceCall(serviceIds[2], TRADING_BOT);
    const r1 = await tx1.wait();
    txNum++;
    txHashes.push(tx1.hash);
    console.log(`[${txNum}] CALL ${serviceNames[serviceIds[2]]} <- TradingBot | tx: ${tx1.hash} | block: ${r1.blockNumber}`);
    await delay(3000);

    const tx2 = await registry.rateService(serviceIds[2], 4);
    const r2 = await tx2.wait();
    txNum++;
    txHashes.push(tx2.hash);
    console.log(`[${txNum}] RATE ${serviceNames[serviceIds[2]]} -> 4/5 | tx: ${tx2.hash} | block: ${r2.blockNumber}`);
  } catch (e) {
    console.error(`[ERR] Mixed: ${e.message.slice(0, 100)}`);
  }

  // --- Summary ---
  const finalBalance = await provider.getBalance(wallet.address);
  const gasSpent = balance - finalBalance;

  console.log("\n" + "=".repeat(60));
  console.log(`Total transactions: ${txNum}`);
  console.log(`Gas spent: ${ethers.formatEther(gasSpent)} OKB`);
  console.log(`Remaining balance: ${ethers.formatEther(finalBalance)} OKB`);
  console.log("\nAll tx hashes:");
  txHashes.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));

  // Final contract state
  const profile = await registry.getAgentProfile(wallet.address);
  console.log(`\nAgent: ${profile.name}`);
  console.log(`  Services provided: ${profile.totalServicesProvided}`);
  console.log(`  Total earned: ${profile.totalEarned}`);
  console.log(`  Reputation: ${profile.reputationScore}`);

  for (const sid of serviceIds) {
    const svc = await registry.getServiceById(sid);
    console.log(`  ${svc.name}: ${svc.totalCalls} calls, revenue: ${svc.totalRevenue}, price: ${svc.pricePerCall}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
