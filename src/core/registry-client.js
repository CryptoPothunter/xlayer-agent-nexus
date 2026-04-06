/**
 * ServiceRegistry Client - Interface to the on-chain ServiceRegistry contract
 */
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load ABI from compiled artifact
function loadABI() {
  try {
    const artifact = JSON.parse(
      readFileSync(
        join(__dirname, "../../artifacts/contracts/ServiceRegistry.sol/ServiceRegistry.json"),
        "utf-8"
      )
    );
    return artifact.abi;
  } catch {
    console.warn("[Registry] ABI not found, using inline ABI");
    return INLINE_ABI;
  }
}

// Minimal inline ABI as fallback
const INLINE_ABI = [
  "function registerAgent(string name) external",
  "function registerService(string name, string description, string endpoint, uint256 pricePerCall) external returns (bytes32)",
  "function recordServiceCall(bytes32 serviceId, address caller) external",
  "function rateService(bytes32 serviceId, uint8 score) external",
  "function updateServicePrice(bytes32 serviceId, uint256 newPrice) external",
  "function deactivateService(bytes32 serviceId) external",
  "function getServiceCount() view returns (uint256)",
  "function getServiceById(bytes32 serviceId) view returns (tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt))",
  "function getAgentProfile(address agent) view returns (tuple(address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered))",
  "function getAllActiveServices() view returns (bytes32[], tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt)[])",
  "function getAgentServices(address agent) view returns (bytes32[])",
  "function getAverageRating(bytes32 serviceId) view returns (uint256)",
  "event AgentRegistered(address indexed agent, string name)",
  "event ServiceRegistered(bytes32 indexed serviceId, address indexed provider, string name, uint256 price)",
  "event ServiceCalled(bytes32 indexed serviceId, address indexed caller, address indexed provider, uint256 price)",
  "event ServiceRated(bytes32 indexed serviceId, address indexed rater, uint8 rating)",
];

export class RegistryClient {
  constructor({ provider, signer, contractAddress }) {
    this.provider = provider;
    this.signer = signer;
    this.contractAddress = contractAddress;

    const abi = loadABI();
    this.contract = new ethers.Contract(contractAddress, abi, signer || provider);
  }

  // ─── Agent Operations ──────────────────────────────────

  async registerAgent(name) {
    const tx = await this.contract.registerAgent(name);
    const receipt = await tx.wait();
    console.log(`[Registry] Agent "${name}" registered. TX: ${receipt.hash}`);
    return receipt;
  }

  async getAgentProfile(address) {
    return await this.contract.getAgentProfile(address);
  }

  // ─── Service Operations ────────────────────────────────

  async registerService({ name, description, endpoint, pricePerCall }) {
    const price = ethers.parseUnits(pricePerCall.toString(), 18);
    const tx = await this.contract.registerService(name, description, endpoint, price);
    const receipt = await tx.wait();

    // Extract serviceId from event
    const event = receipt.logs.find((l) => {
      try {
        return this.contract.interface.parseLog(l)?.name === "ServiceRegistered";
      } catch {
        return false;
      }
    });

    let serviceId = null;
    if (event) {
      const parsed = this.contract.interface.parseLog(event);
      serviceId = parsed.args[0];
    }

    console.log(`[Registry] Service "${name}" registered. ID: ${serviceId}`);
    return { receipt, serviceId };
  }

  async recordServiceCall(serviceId, callerAddress) {
    const tx = await this.contract.recordServiceCall(serviceId, callerAddress);
    return await tx.wait();
  }

  async rateService(serviceId, score) {
    const tx = await this.contract.rateService(serviceId, score);
    return await tx.wait();
  }

  async updatePrice(serviceId, newPrice) {
    const price = ethers.parseUnits(newPrice.toString(), 18);
    const tx = await this.contract.updateServicePrice(serviceId, price);
    return await tx.wait();
  }

  // ─── Discovery ─────────────────────────────────────────

  async getAllActiveServices() {
    const [ids, services] = await this.contract.getAllActiveServices();
    return ids.map((id, i) => ({
      id,
      ...parseService(services[i]),
    }));
  }

  async getServiceById(serviceId) {
    const svc = await this.contract.getServiceById(serviceId);
    return parseService(svc);
  }

  async getServiceCount() {
    return Number(await this.contract.getServiceCount());
  }

  async getAverageRating(serviceId) {
    const rating = await this.contract.getAverageRating(serviceId);
    return Number(rating) / 100; // Convert from fixed point
  }

  // ─── Event Listeners ───────────────────────────────────

  onServiceRegistered(callback) {
    this.contract.on("ServiceRegistered", (serviceId, provider, name, price) => {
      callback({ serviceId, provider, name, price: ethers.formatUnits(price, 18) });
    });
  }

  onServiceCalled(callback) {
    this.contract.on("ServiceCalled", (serviceId, caller, provider, price) => {
      callback({ serviceId, caller, provider, price: ethers.formatUnits(price, 18) });
    });
  }
}

function parseService(svc) {
  return {
    provider: svc.provider || svc[0],
    name: svc.name || svc[1],
    description: svc.description || svc[2],
    endpoint: svc.endpoint || svc[3],
    pricePerCall: ethers.formatUnits(svc.pricePerCall || svc[4], 18),
    totalCalls: Number(svc.totalCalls || svc[5]),
    totalRevenue: ethers.formatUnits(svc.totalRevenue || svc[6], 18),
    rating: Number(svc.rating || svc[7]),
    ratingCount: Number(svc.ratingCount || svc[8]),
    active: svc.active ?? svc[9],
    registeredAt: Number(svc.registeredAt || svc[10]),
  };
}

export default RegistryClient;
