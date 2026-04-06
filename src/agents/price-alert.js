/**
 * Price Alert Service Agent
 * Monitors token prices via OnchainOS Market module and triggers
 * alerts when conditions are met. Supports multiple watch targets.
 *
 * This agent earns fees by providing price monitoring intelligence.
 */

export class PriceAlertAgent {
  constructor({ onchainos, registry, walletAddress }) {
    this.onchainos = onchainos;
    this.registry = registry;
    this.walletAddress = walletAddress;
    this.serviceId = null;
    this.callCount = 0;
    this.name = "PriceAlert";
    this.watchList = new Map();
    this.alertHistory = [];
    this.isMonitoring = false;
    this.monitorInterval = null;
  }

  /** Register this service on the marketplace */
  async register() {
    try {
      const { serviceId } = await this.registry.registerService({
        name: "PriceAlert",
        description:
          "Real-time price monitoring for X Layer tokens. Set price targets (above/below) and get instant alerts. Powered by OnchainOS Market data with sub-second updates.",
        endpoint: `x402://agent/${this.walletAddress}/price-alert`,
        pricePerCall: 0.002, // 0.002 USDT per alert setup
      });
      this.serviceId = serviceId;
      console.log(`[PriceAlert] Registered with ID: ${serviceId}`);
      return serviceId;
    } catch (e) {
      console.error(`[PriceAlert] Registration failed:`, e.message);
      return null;
    }
  }

  /**
   * Core service: Set up a price alert
   * @param {Object} params - { tokenAddress, targetPrice, direction, callback }
   * @returns {Object} Alert configuration confirmation
   */
  async execute({ tokenAddress, targetPrice, direction = "above", callerAddress, callback }) {
    this.callCount++;
    console.log(
      `[PriceAlert] Call #${this.callCount}: Watch ${tokenAddress} ${direction} ${targetPrice}`
    );

    // Get current price
    const currentPrice = await this.onchainos.getTokenPrice(tokenAddress);

    const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const alert = {
      id: alertId,
      tokenAddress,
      targetPrice: parseFloat(targetPrice),
      direction, // "above" or "below"
      currentPrice: currentPrice?.price || null,
      callerAddress,
      callback,
      createdAt: Date.now(),
      triggered: false,
      triggeredAt: null,
    };

    this.watchList.set(alertId, alert);

    // Start monitoring if not already running
    if (!this.isMonitoring) {
      this._startMonitoring();
    }

    // Record call on-chain
    if (this.serviceId && callerAddress) {
      try {
        await this.registry.recordServiceCall(this.serviceId, callerAddress);
      } catch (e) {
        console.warn(`[PriceAlert] Failed to record call:`, e.message);
      }
    }

    return {
      alertId,
      tokenAddress,
      targetPrice,
      direction,
      currentPrice: currentPrice?.price || "unknown",
      status: "active",
      message: `Alert set: will trigger when price goes ${direction} ${targetPrice}`,
    };
  }

  /**
   * Check all active alerts
   */
  async checkAlerts() {
    const results = [];

    for (const [alertId, alert] of this.watchList) {
      if (alert.triggered) continue;

      try {
        const priceData = await this.onchainos.getTokenPrice(alert.tokenAddress);
        const currentPrice = parseFloat(priceData?.price || 0);

        if (!currentPrice) continue;

        let shouldTrigger = false;
        if (alert.direction === "above" && currentPrice >= alert.targetPrice) {
          shouldTrigger = true;
        } else if (alert.direction === "below" && currentPrice <= alert.targetPrice) {
          shouldTrigger = true;
        }

        if (shouldTrigger) {
          alert.triggered = true;
          alert.triggeredAt = Date.now();
          alert.triggeredPrice = currentPrice;

          const alertEvent = {
            alertId,
            tokenAddress: alert.tokenAddress,
            targetPrice: alert.targetPrice,
            triggeredPrice: currentPrice,
            direction: alert.direction,
            timestamp: Date.now(),
          };

          this.alertHistory.push(alertEvent);
          results.push(alertEvent);

          console.log(
            `[PriceAlert] TRIGGERED: ${alert.tokenAddress} ${alert.direction} ${alert.targetPrice} (current: ${currentPrice})`
          );

          // Execute callback if provided
          if (alert.callback && typeof alert.callback === "function") {
            try {
              await alert.callback(alertEvent);
            } catch (e) {
              console.error(`[PriceAlert] Callback error:`, e.message);
            }
          }
        }
      } catch (e) {
        console.warn(`[PriceAlert] Check failed for ${alertId}:`, e.message);
      }
    }

    return results;
  }

  /**
   * Get current status of all alerts
   */
  getActiveAlerts() {
    const active = [];
    for (const [, alert] of this.watchList) {
      if (!alert.triggered) {
        active.push({
          id: alert.id,
          tokenAddress: alert.tokenAddress,
          targetPrice: alert.targetPrice,
          direction: alert.direction,
          createdAt: alert.createdAt,
        });
      }
    }
    return active;
  }

  /**
   * Cancel an alert
   */
  cancelAlert(alertId) {
    const alert = this.watchList.get(alertId);
    if (alert) {
      this.watchList.delete(alertId);
      return { success: true, alertId };
    }
    return { success: false, error: "Alert not found" };
  }

  // ─── Internal ──────────────────────────────────────────

  _startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    console.log("[PriceAlert] Monitoring started (30s interval)");

    this.monitorInterval = setInterval(async () => {
      if (this.watchList.size === 0) return;
      await this.checkAlerts();
    }, 30000); // Check every 30 seconds
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    console.log("[PriceAlert] Monitoring stopped");
  }

  getStats() {
    return {
      name: this.name,
      serviceId: this.serviceId,
      totalCalls: this.callCount,
      activeAlerts: [...this.watchList.values()].filter((a) => !a.triggered).length,
      triggeredAlerts: this.alertHistory.length,
    };
  }
}

export default PriceAlertAgent;
