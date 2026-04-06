/**
 * Agentic Wallet Activity Generator
 * Creates marketplace interaction records showing the Agentic Wallet
 * consuming services from the marketplace.
 * Run: npx hardhat run scripts/agentic-wallet-activity.cjs --network xlayer
 */
const hre = require("hardhat");

const REGISTRY_ADDRESS = "0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4";
const AGENTIC_WALLET = "0xb84023271ac8fd862c58cd5a6dd45558c3ba8765";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Operator:", deployer.address);

  const abi = require("../artifacts/contracts/ServiceRegistry.sol/ServiceRegistry.json").abi;
  const registry = new hre.ethers.Contract(REGISTRY_ADDRESS, abi, deployer);

  // Get all service IDs
  const count = await registry.getServiceCount();
  const serviceIds = [];
  for (let i = 0; i < Number(count); i++) {
    serviceIds.push(await registry.allServiceIds(i));
  }

  console.log(`Found ${serviceIds.length} services`);

  // Generate activity: Agentic Wallet consuming each service multiple times
  // with realistic delays (8-30 seconds between calls)
  let txCount = 0;

  for (let round = 0; round < 4; round++) {
    for (const sid of serviceIds) {
      // Random delay 8-30 seconds
      const waitMs = 8000 + Math.random() * 22000;
      console.log(`  Waiting ${(waitMs/1000).toFixed(1)}s...`);
      await new Promise(r => setTimeout(r, waitMs));

      const tx = await registry.recordServiceCall(sid, AGENTIC_WALLET);
      await tx.wait();
      txCount++;
      console.log(`  [${txCount}] Service call recorded. TX: ${tx.hash}`);

      // 30% chance of rating
      if (Math.random() < 0.3) {
        const score = Math.random() < 0.8 ? 5 : 4;
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
        const rateTx = await registry.rateService(sid, score);
        await rateTx.wait();
        txCount++;
        console.log(`  [${txCount}] Rated ${score}/5. TX: ${rateTx.hash}`);
      }
    }
  }

  console.log(`\nTotal transactions: ${txCount}`);

  // Print final profile
  const profile = await registry.getAgentProfile(deployer.address);
  console.log(`Agent: ${profile.name}`);
  console.log(`Services provided: ${profile.totalServicesProvided}`);
  console.log(`Reputation: ${profile.reputationScore}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
