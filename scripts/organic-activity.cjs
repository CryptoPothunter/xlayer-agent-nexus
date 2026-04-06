/**
 * Organic Activity Generator — creates realistic marketplace usage patterns
 * Run: npx hardhat run scripts/organic-activity.cjs --network xlayer
 */
const hre = require("hardhat");

const REGISTRY_ADDRESS = "0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4";

const CALLERS = [
  "0xB84023271ac8fD862C58CD5A6dD45558C3Ba8765", // Agentic Wallet
  "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18", // Simulated DeFi Agent
  "0x8ba1f109551bD432803012645Ac136ddd64DBA72", // Simulated Analytics Agent
  "0x2546BcD3c84621e976D8185a91A922aE77ECEc30", // Simulated Trading Bot
];

const CALLER_LABELS = {
  "0xB84023271ac8fD862C58CD5A6dD45558C3Ba8765": "Agentic Wallet",
  "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18": "DeFi Agent",
  "0x8ba1f109551bD432803012645Ac136ddd64DBA72": "Analytics Agent",
  "0x2546BcD3c84621e976D8185a91A922aE77ECEc30": "Trading Bot",
};

// Weighted random — Agentic Wallet gets ~40% of calls
function pickCaller() {
  const weights = [40, 25, 20, 15];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return CALLERS[i];
  }
  return CALLERS[0];
}

// Random delay between min and max milliseconds
function delay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Timestamp prefix for log lines
function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// Pick a weighted-random rating: mostly 4-5, occasionally 3
function pickRating() {
  const r = Math.random();
  if (r < 0.15) return 3;
  if (r < 0.55) return 4;
  return 5;
}

// Small incremental price change (±5-15%) around current price
function nudgePrice(currentPrice) {
  const pct = (Math.random() * 0.10 + 0.05) * (Math.random() < 0.5 ? -1 : 1);
  const delta = Math.round(Number(currentPrice) * pct);
  const newPrice = Math.max(100, Number(currentPrice) + delta);
  return BigInt(newPrice);
}

// Pick N random items from an array, weighted toward lower indices (simulates
// some services being more popular than others)
function pickServices(serviceIds, count) {
  const picked = [];
  const pool = [...serviceIds];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    // Bias toward earlier (more popular) services
    const weights = pool.map((_, idx) => pool.length - idx);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let chosen = 0;
    for (let j = 0; j < weights.length; j++) {
      r -= weights[j];
      if (r <= 0) { chosen = j; break; }
    }
    picked.push(pool.splice(chosen, 1)[0]);
  }
  return picked;
}

async function main() {
  const rounds = parseInt(process.env.ROUNDS, 10) || 3;

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`[${ts()}] Operator: ${deployer.address}`);
  console.log(`[${ts()}] Balance:  ${hre.ethers.formatEther(balance)} OKB`);
  console.log(`[${ts()}] Rounds:   ${rounds}\n`);

  const abi = require("../artifacts/contracts/ServiceRegistry.sol/ServiceRegistry.json").abi;
  const registry = new hre.ethers.Contract(REGISTRY_ADDRESS, abi, deployer);

  // Load service IDs
  const svcCount = Number(await registry.getServiceCount());
  console.log(`[${ts()}] Services on marketplace: ${svcCount}`);

  const serviceIds = [];
  const serviceNames = {};
  for (let i = 0; i < svcCount; i++) {
    const sid = await registry.allServiceIds(i);
    serviceIds.push(sid);
    const svc = await registry.getServiceById(sid);
    serviceNames[sid] = svc.name;
    console.log(`  [${i}] ${svc.name} — ${svc.totalCalls} calls, price: ${svc.pricePerCall}`);
  }

  if (serviceIds.length === 0) {
    console.log("No services found. Exiting.");
    return;
  }

  let txCount = 0;
  let callCount = 0;
  let ratingCount = 0;
  let priceUpdateCount = 0;

  console.log(`\n[${ts()}] Starting organic activity generation...\n`);

  for (let round = 1; round <= rounds; round++) {
    console.log(`═══ Round ${round}/${rounds} ═══`);

    // Pick 1-3 services to call this round
    const numCalls = Math.floor(Math.random() * 3) + 1;
    const targets = pickServices(serviceIds, numCalls);

    for (const sid of targets) {
      const caller = pickCaller();
      const label = CALLER_LABELS[caller.toLowerCase()] || caller.slice(0, 10);
      const svcName = serviceNames[sid] || sid.slice(0, 10);

      try {
        const tx = await registry.recordServiceCall(sid, caller);
        await tx.wait();
        txCount++;
        callCount++;
        console.log(`[${ts()}] CALL  ${svcName} ← ${label}  tx:${tx.hash.slice(0, 18)}…`);
      } catch (e) {
        console.error(`[${ts()}] CALL ERROR ${svcName}: ${e.message.slice(0, 80)}`);
      }

      // 20% chance of rating after a call
      if (Math.random() < 0.20) {
        const score = pickRating();
        try {
          const tx = await registry.rateService(sid, score);
          await tx.wait();
          txCount++;
          ratingCount++;
          console.log(`[${ts()}] RATE  ${svcName} → ${score}/5  tx:${tx.hash.slice(0, 18)}…`);
        } catch (e) {
          console.error(`[${ts()}] RATE ERROR ${svcName}: ${e.message.slice(0, 80)}`);
        }
      }

      // Random organic delay between actions (5-45 seconds)
      const delayMs = Math.floor(Math.random() * 40000) + 5000;
      console.log(`[${ts()}] waiting ${(delayMs / 1000).toFixed(1)}s...`);
      await delay(delayMs, delayMs);
    }

    // 10% chance of a small price update at the end of a round
    if (Math.random() < 0.10) {
      const sid = serviceIds[Math.floor(Math.random() * serviceIds.length)];
      const svcName = serviceNames[sid] || sid.slice(0, 10);
      try {
        const svc = await registry.getServiceById(sid);
        const newPrice = nudgePrice(svc.pricePerCall);
        const tx = await registry.updateServicePrice(sid, newPrice);
        await tx.wait();
        txCount++;
        priceUpdateCount++;
        console.log(`[${ts()}] PRICE ${svcName} ${svc.pricePerCall} → ${newPrice}  tx:${tx.hash.slice(0, 18)}…`);
      } catch (e) {
        console.error(`[${ts()}] PRICE ERROR ${svcName}: ${e.message.slice(0, 80)}`);
      }
    }

    console.log("");
  }

  // ─── Summary ────────────────────────────────────────────
  console.log("═══ Session Summary ═══");
  console.log(`Transactions sent: ${txCount}`);
  console.log(`  Service calls:   ${callCount}`);
  console.log(`  Ratings:         ${ratingCount}`);
  console.log(`  Price updates:   ${priceUpdateCount}`);

  const profile = await registry.getAgentProfile(deployer.address);
  console.log(`\nAgent: ${profile.name}`);
  console.log(`  Services provided: ${profile.totalServicesProvided}`);
  console.log(`  Total earned:      ${profile.totalEarned}`);
  console.log(`  Reputation:        ${profile.reputationScore}`);

  for (const sid of serviceIds) {
    const svc = await registry.getServiceById(sid);
    const avg = await registry.getAverageRating(sid);
    console.log(`\n  ${svc.name}: ${svc.totalCalls} calls, revenue: ${svc.totalRevenue}, rating: ${avg}/500`);
  }

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`\nGas spent: ${hre.ethers.formatEther(balance - finalBalance)} OKB`);
  console.log(`Remaining: ${hre.ethers.formatEther(finalBalance)} OKB`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
