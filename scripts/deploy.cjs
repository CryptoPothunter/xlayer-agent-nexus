/**
 * Deploy ServiceRegistry to X Layer
 */
const hre = require("hardhat");

async function main() {
  console.log("Deploying ServiceRegistry to X Layer...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "OKB\n");

  // USDT on X Layer
  const USDT_ADDRESS = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d";

  const ServiceRegistry = await hre.ethers.getContractFactory("ServiceRegistry");
  const registry = await ServiceRegistry.deploy(USDT_ADDRESS);

  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("ServiceRegistry deployed to:", address);
  console.log("\nAdd to .env:");
  console.log(`SERVICE_REGISTRY_ADDRESS=${address}`);

  // Verify deployment
  const svcCount = await registry.getServiceCount();
  console.log(`\nVerification: Service count = ${svcCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
