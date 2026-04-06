/**
 * Token Scanner Service Agent
 * Uses OnchainOS Security module to provide comprehensive
 * token and contract safety assessments.
 *
 * This agent earns fees by providing security intelligence.
 */

export class TokenScannerAgent {
  constructor({ onchainos, registry, walletAddress }) {
    this.onchainos = onchainos;
    this.registry = registry;
    this.walletAddress = walletAddress;
    this.serviceId = null;
    this.callCount = 0;
    this.name = "TokenScanner";
    this.scanCache = new Map();
  }

  /** Register this service on the marketplace */
  async register() {
    try {
      const { serviceId } = await this.registry.registerService({
        name: "TokenScanner",
        description:
          "Comprehensive security analysis for tokens and contracts on X Layer. Checks for rug pulls, honeypots, suspicious ownership, and known vulnerabilities via OnchainOS Security API.",
        endpoint: `x402://agent/${this.walletAddress}/token-scanner`,
        pricePerCall: 0.005, // 0.005 USDT per scan
      });
      this.serviceId = serviceId;
      console.log(`[TokenScanner] Registered with ID: ${serviceId}`);
      return serviceId;
    } catch (e) {
      console.error(`[TokenScanner] Registration failed:`, e.message);
      return null;
    }
  }

  /**
   * Core service: Scan a token for security risks
   * @param {Object} params - { tokenAddress, includeContract }
   * @returns {Object} Security assessment report
   */
  async execute({ tokenAddress, includeContract = true, callerAddress }) {
    this.callCount++;
    console.log(`[TokenScanner] Call #${this.callCount}: scanning ${tokenAddress}`);

    // Check cache (5 minute TTL)
    const cacheKey = tokenAddress.toLowerCase();
    const cached = this.scanCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) {
      console.log(`[TokenScanner] Cache hit for ${tokenAddress}`);
      return cached.result;
    }

    const report = {
      timestamp: Date.now(),
      tokenAddress,
      tokenScan: null,
      contractScan: null,
      riskScore: 0, // 0 = safe, 100 = dangerous
      riskLevel: "unknown",
      warnings: [],
      recommendation: "",
    };

    // Run scans in parallel
    const scanPromises = [this.onchainos.scanToken(tokenAddress)];
    if (includeContract) {
      scanPromises.push(this.onchainos.scanContract(tokenAddress));
    }

    const [tokenResult, contractResult] = await Promise.allSettled(scanPromises);

    // Process token scan
    if (tokenResult.status === "fulfilled" && tokenResult.value) {
      report.tokenScan = tokenResult.value;
      const scan = tokenResult.value;

      // Analyze risk factors
      if (scan.isHoneypot) {
        report.riskScore += 50;
        report.warnings.push("CRITICAL: Token detected as honeypot");
      }
      if (scan.isOpenSource === false) {
        report.riskScore += 15;
        report.warnings.push("Contract source code is not verified");
      }
      if (scan.holderCount < 50) {
        report.riskScore += 10;
        report.warnings.push(`Low holder count: ${scan.holderCount}`);
      }
      if (scan.ownerChangeBalance) {
        report.riskScore += 20;
        report.warnings.push("Owner can modify balances");
      }
      if (scan.canTakeBackOwnership) {
        report.riskScore += 15;
        report.warnings.push("Ownership can be reclaimed");
      }
      if (scan.transferPausable) {
        report.riskScore += 10;
        report.warnings.push("Transfers can be paused by owner");
      }
    }

    // Process contract scan
    if (contractResult?.status === "fulfilled" && contractResult.value) {
      report.contractScan = contractResult.value;
      const cscan = contractResult.value;

      if (cscan.isProxy) {
        report.riskScore += 5;
        report.warnings.push("Contract is upgradeable (proxy pattern)");
      }
      if (cscan.selfDestruct) {
        report.riskScore += 25;
        report.warnings.push("Contract contains self-destruct capability");
      }
    }

    // Determine risk level
    if (report.riskScore >= 60) {
      report.riskLevel = "critical";
      report.recommendation = "DO NOT interact with this token. High probability of scam.";
    } else if (report.riskScore >= 30) {
      report.riskLevel = "high";
      report.recommendation = "Exercise extreme caution. Multiple risk factors detected.";
    } else if (report.riskScore >= 15) {
      report.riskLevel = "medium";
      report.recommendation = "Some risk factors present. Proceed with caution and small amounts.";
    } else {
      report.riskLevel = "low";
      report.recommendation = "No major risks detected. Standard precautions apply.";
    }

    // Cache result
    this.scanCache.set(cacheKey, { result: report, timestamp: Date.now() });

    // Record call on-chain
    if (this.serviceId && callerAddress) {
      try {
        await this.registry.recordServiceCall(this.serviceId, callerAddress);
      } catch (e) {
        console.warn(`[TokenScanner] Failed to record call:`, e.message);
      }
    }

    return report;
  }

  getStats() {
    return {
      name: this.name,
      serviceId: this.serviceId,
      totalCalls: this.callCount,
      cacheSize: this.scanCache.size,
    };
  }
}

export default TokenScannerAgent;
