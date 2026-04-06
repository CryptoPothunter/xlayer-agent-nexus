/**
 * Generate additional on-chain activity for "Most Active Agent" prize
 * Simulates realistic agent-to-agent marketplace interactions
 */
const hre = require("hardhat");

const REGISTRY_ADDRESS = "0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Operator:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "OKB\n");

  const abi = require("../artifacts/contracts/ServiceRegistry.sol/ServiceRegistry.json").abi;
  const registry = new hre.ethers.Contract(REGISTRY_ADDRESS, abi, deployer);

  // Get existing service IDs
  const svcCount = await registry.getServiceCount();
  console.log("Services on marketplace:", svcCount.toString());

  const serviceIds = [];
  for (let i = 0; i < Number(svcCount); i++) {
    const sid = await registry.allServiceIds(i);
    serviceIds.push(sid);
    const svc = await registry.getServiceById(sid);
    console.log(`  [${i}] ${svc.name} - ${svc.totalCalls} calls`);
  }

  const callers = [
    "0xb84023271ac8fd862c58cd5a6dd45558c3ba8765", // Agentic Wallet
    "0x0000000000000000000000000000000000000001", // Simulated Agent A
    "0x0000000000000000000000000000000000000002", // Simulated Agent B
    "0x0000000000000000000000000000000000000003", // Simulated Agent C
  ];

  let txCount = 0;

  // Batch 1: Service calls from multiple "agents"
  console.log("\n=== Batch 1: Multi-agent service calls ===");
  for (let round = 0; round < 5; round++) {
    for (const sid of serviceIds) {
      const caller = callers[round % callers.length];
      try {
        const tx = await registry.recordServiceCall(sid, caller);
        await tx.wait();
        txCount++;
        process.stdout.write(`\r  Transactions: ${txCount}`);
      } catch (e) {
        console.error(`\n  Error: ${e.message.slice(0, 60)}`);
      }
    }
  }

  // Batch 2: More ratings
  console.log("\n\n=== Batch 2: Additional ratings ===");
  for (const sid of serviceIds) {
    const score = Math.floor(Math.random() * 2) + 4; // 4 or 5
    try {
      const tx = await registry.rateService(sid, score);
      await tx.wait();
      txCount++;
      console.log(`  Rated with ${score}/5. TX: ${tx.hash.slice(0, 18)}...`);
    } catch (e) {
      console.error(`  Rating error: ${e.message.slice(0, 60)}`);
    }
  }

  // Batch 3: Price fluctuations (simulating autonomous repricing)
  console.log("\n=== Batch 3: Autonomous repricing ===");
  const basePrices = [4000, 3500, 800]; // in micro-USDT
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < serviceIds.length; i++) {
      const variation = Math.floor(Math.random() * 1000) - 500;
      const newPrice = Math.max(100, basePrices[i] + variation);
      try {
        const tx = await registry.updateServicePrice(serviceIds[i], BigInt(newPrice));
        await tx.wait();
        txCount++;
        process.stdout.write(`\r  Price update TXs: ${txCount}`);
      } catch (e) {
        console.error(`\n  Price error: ${e.message.slice(0, 60)}`);
      }
    }
  }

  // Batch 4: More service calls
  console.log("\n\n=== Batch 4: High-frequency service calls ===");
  for (let round = 0; round < 5; round++) {
    for (const sid of serviceIds) {
      const caller = callers[(round + 1) % callers.length];
      try {
        const tx = await registry.recordServiceCall(sid, caller);
        await tx.wait();
        txCount++;
        process.stdout.write(`\r  Total TXs: ${txCount}`);
      } catch (e) {
        console.error(`\n  Error: ${e.message.slice(0, 60)}`);
      }
    }
  }

  // Final stats
  console.log("\n\n=== Final Statistics ===");
  console.log(`New transactions this batch: ${txCount}`);

  const profile = await registry.getAgentProfile(deployer.address);
  console.log(`\nAgent: ${profile.name}`);
  console.log(`  Services provided: ${profile.totalServicesProvided}`);
  console.log(`  Total earned: ${profile.totalEarned}`);
  console.log(`  Reputation: ${profile.reputationScore}`);

  for (const sid of serviceIds) {
    const svc = await registry.getServiceById(sid);
    const avg = await registry.getAverageRating(sid);
    console.log(`\n  ${svc.name}: ${svc.totalCalls} calls, revenue: ${svc.totalRevenue}, rating: ${avg}/500`);
  }

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`\nRemaining balance: ${hre.ethers.formatEther(finalBalance)} OKB`);
  console.log(`Gas spent: ${hre.ethers.formatEther(balance - finalBalance)} OKB`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
