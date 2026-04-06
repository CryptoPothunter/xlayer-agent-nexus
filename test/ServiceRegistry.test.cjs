const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ServiceRegistry", function () {
  let registry;
  let owner, agent1, agent2;
  const USDT_ADDRESS = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d";

  beforeEach(async function () {
    [owner, agent1, agent2] = await ethers.getSigners();
    const ServiceRegistry = await ethers.getContractFactory("ServiceRegistry");
    registry = await ServiceRegistry.deploy(USDT_ADDRESS);
    await registry.waitForDeployment();
  });

  describe("Agent Registration", function () {
    it("should register a new agent", async function () {
      await registry.connect(agent1).registerAgent("TestAgent");
      const profile = await registry.getAgentProfile(agent1.address);
      expect(profile.registered).to.be.true;
      expect(profile.name).to.equal("TestAgent");
      expect(profile.reputationScore).to.equal(100);
    });

    it("should reject duplicate registration", async function () {
      await registry.connect(agent1).registerAgent("TestAgent");
      await expect(
        registry.connect(agent1).registerAgent("TestAgent2")
      ).to.be.revertedWith("Already registered");
    });
  });

  describe("Service Registration", function () {
    beforeEach(async function () {
      await registry.connect(agent1).registerAgent("Provider");
    });

    it("should register a service", async function () {
      const tx = await registry
        .connect(agent1)
        .registerService("SwapOptimizer", "Find best swap routes", "x402://agent/swap", ethers.parseUnits("0.01", 18));
      const receipt = await tx.wait();

      const count = await registry.getServiceCount();
      expect(count).to.equal(1);
    });

    it("should reject unregistered agent", async function () {
      await expect(
        registry
          .connect(agent2)
          .registerService("Service", "Desc", "endpoint", 100)
      ).to.be.revertedWith("Agent not registered");
    });
  });

  describe("Service Calls", function () {
    let serviceId;

    beforeEach(async function () {
      await registry.connect(agent1).registerAgent("Provider");
      await registry.connect(agent2).registerAgent("Consumer");

      const tx = await registry
        .connect(agent1)
        .registerService("SwapOptimizer", "Find best routes", "x402://swap", ethers.parseUnits("0.01", 18));
      const receipt = await tx.wait();

      // Get service ID from events
      const [ids] = await registry.getAllActiveServices();
      serviceId = ids[0];
    });

    it("should record a service call", async function () {
      await registry.connect(agent1).recordServiceCall(serviceId, agent2.address);

      const service = await registry.getServiceById(serviceId);
      expect(service.totalCalls).to.equal(1);

      const providerProfile = await registry.getAgentProfile(agent1.address);
      expect(providerProfile.totalServicesProvided).to.equal(1);

      const consumerProfile = await registry.getAgentProfile(agent2.address);
      expect(consumerProfile.totalServicesConsumed).to.equal(1);
    });
  });

  describe("Rating System", function () {
    let serviceId;

    beforeEach(async function () {
      await registry.connect(agent1).registerAgent("Provider");
      await registry.connect(agent2).registerAgent("Rater");

      await registry
        .connect(agent1)
        .registerService("Scanner", "Token scan", "x402://scan", ethers.parseUnits("0.005", 18));
      const [ids] = await registry.getAllActiveServices();
      serviceId = ids[0];
    });

    it("should rate a service", async function () {
      await registry.connect(agent2).rateService(serviceId, 5);
      const avgRating = await registry.getAverageRating(serviceId);
      expect(avgRating).to.equal(500); // 5.00 * 100
    });

    it("should reject invalid scores", async function () {
      await expect(
        registry.connect(agent2).rateService(serviceId, 0)
      ).to.be.revertedWith("Score must be 1-5");

      await expect(
        registry.connect(agent2).rateService(serviceId, 6)
      ).to.be.revertedWith("Score must be 1-5");
    });
  });

  describe("Service Discovery", function () {
    beforeEach(async function () {
      await registry.connect(agent1).registerAgent("Provider");
      await registry
        .connect(agent1)
        .registerService("Service1", "Desc1", "ep1", ethers.parseUnits("0.01", 18));
      await registry
        .connect(agent1)
        .registerService("Service2", "Desc2", "ep2", ethers.parseUnits("0.02", 18));
    });

    it("should list all active services", async function () {
      const [ids, services] = await registry.getAllActiveServices();
      expect(ids.length).to.equal(2);
      expect(services[0].name).to.equal("Service1");
      expect(services[1].name).to.equal("Service2");
    });

    it("should filter deactivated services", async function () {
      const [ids] = await registry.getAllActiveServices();
      await registry.connect(agent1).deactivateService(ids[0]);

      const [activeIds] = await registry.getAllActiveServices();
      expect(activeIds.length).to.equal(1);
    });
  });

  describe("Dynamic Pricing", function () {
    let serviceId;

    beforeEach(async function () {
      await registry.connect(agent1).registerAgent("Provider");
      await registry
        .connect(agent1)
        .registerService("Service", "Desc", "ep", ethers.parseUnits("0.01", 18));
      const [ids] = await registry.getAllActiveServices();
      serviceId = ids[0];
    });

    it("should allow provider to update price", async function () {
      const newPrice = ethers.parseUnits("0.02", 18);
      await registry.connect(agent1).updateServicePrice(serviceId, newPrice);

      const service = await registry.getServiceById(serviceId);
      expect(service.pricePerCall).to.equal(newPrice);
    });

    it("should reject non-provider price update", async function () {
      await expect(
        registry.connect(agent2).updateServicePrice(serviceId, 200)
      ).to.be.revertedWith("Not service provider");
    });
  });
});
