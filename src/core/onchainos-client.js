/**
 * OnchainOS Client - Unified interface to OKX Onchain OS APIs
 * Covers: Wallet, DEX, Market, Security modules
 * Auth: HMAC-SHA256 signed requests per OKX documentation
 */
import axios from "axios";
import crypto from "crypto";
import querystring from "querystring";

const ONCHAINOS_BASE = "https://web3.okx.com";
const XLAYER_CHAIN_ID = "196";

export class OnchainOSClient {
  constructor({ apiKey, secretKey, passphrase, projectId, walletAddress }) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.passphrase = passphrase;
    this.projectId = projectId;
    this.walletAddress = walletAddress;
  }

  // ─── Auth & Request ────────────────────────────────────

  _sign(timestamp, method, requestPath, params) {
    let queryStr = "";
    if (method === "GET" && params && Object.keys(params).length > 0) {
      queryStr = "?" + querystring.stringify(params);
    }
    if (method === "POST" && params) {
      queryStr = JSON.stringify(params);
    }
    const preHash = timestamp + method + requestPath + queryStr;
    const hmac = crypto.createHmac("sha256", this.secretKey);
    hmac.update(preHash);
    return hmac.digest("base64");
  }

  async _request(method, path, params = {}) {
    const timestamp = new Date().toISOString().slice(0, -5) + "Z";
    const signature = this._sign(timestamp, method, path, params);

    const headers = {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": this.apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.passphrase,
    };
    if (this.projectId) {
      headers["OK-ACCESS-PROJECT"] = this.projectId;
    }

    const config = {
      method,
      url:
        ONCHAINOS_BASE +
        path +
        (method === "GET" && Object.keys(params).length
          ? "?" + querystring.stringify(params)
          : ""),
      headers,
      timeout: 30000,
    };

    if (method === "POST") {
      config.data = params;
    }

    const res = await axios(config);
    return res.data;
  }

  async _get(path, params = {}) {
    return this._request("GET", path, params);
  }

  async _post(path, params = {}) {
    return this._request("POST", path, params);
  }

  // ─── Wallet Module ─────────────────────────────────────

  /** Get wallet token balances on X Layer */
  async getBalances(address) {
    const addr = address || this.walletAddress;
    if (!addr) return [];

    // Common tokens on X Layer
    const defaultTokens = [
      { chainIndex: XLAYER_CHAIN_ID, tokenAddress: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d" }, // USDT
      { chainIndex: XLAYER_CHAIN_ID, tokenAddress: "0x5A77f1443D16ee5761d310e38b62f77f726bC71c" }, // WETH
      { chainIndex: XLAYER_CHAIN_ID, tokenAddress: "0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09" }, // WOKB
      { chainIndex: XLAYER_CHAIN_ID, tokenAddress: "0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10" }, // USDC
    ];

    try {
      const res = await this._post("/api/v5/wallet/asset/token-balances-by-address", {
        address: addr,
        tokenAddresses: defaultTokens,
      });
      // Flatten token assets from response
      const assets = res?.data?.[0]?.tokenAssets || [];
      return assets.filter((t) => t.balance !== "0" && t.balance !== "");
    } catch (e) {
      console.error("[OnchainOS] getBalances error:", e.response?.data?.msg || e.message);
      return [];
    }
  }

  /** Get wallet transaction history */
  async getTransactionHistory(address, limit = 20) {
    const addr = address || this.walletAddress;
    if (!addr) return [];
    try {
      const res = await this._get("/api/v5/wallet/post-transaction/transactions-by-address", {
        address: addr,
        chainIndex: XLAYER_CHAIN_ID,
        limit: String(limit),
      });
      return res?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getTransactionHistory error:", e.response?.data?.msg || e.message);
      return [];
    }
  }

  // ─── DEX Module (V6) ──────────────────────────────────

  /** Get swap quote from DEX aggregator (500+ liquidity sources) */
  async getSwapQuote({ fromToken, toToken, amount, slippage = "0.5" }) {
    try {
      const res = await this._get("/api/v6/dex/aggregator/quote", {
        chainIndex: XLAYER_CHAIN_ID,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        amount,
        slippage,
      });
      return res?.data?.[0] || null;
    } catch (e) {
      console.error("[OnchainOS] getSwapQuote error:", e.response?.data?.msg || e.message);
      return null;
    }
  }

  /** Get swap transaction data for execution */
  async getSwapTransaction({
    fromToken,
    toToken,
    amount,
    slippage = "0.5",
    userWalletAddress,
  }) {
    const addr = userWalletAddress || this.walletAddress;
    try {
      const res = await this._get("/api/v6/dex/aggregator/swap", {
        chainIndex: XLAYER_CHAIN_ID,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        amount,
        slippage,
        slippagePercent: slippage,
        userWalletAddress: addr,
      });
      return res?.data?.[0] || null;
    } catch (e) {
      console.error("[OnchainOS] getSwapTransaction error:", e.response?.data?.msg || e.message);
      return null;
    }
  }

  /** Get supported tokens on X Layer */
  async getTokenList() {
    try {
      const res = await this._get("/api/v6/dex/aggregator/all-tokens", {
        chainIndex: XLAYER_CHAIN_ID,
      });
      return res?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getTokenList error:", e.response?.data?.msg || e.message);
      return [];
    }
  }

  /** Get supported chains */
  async getSupportedChains() {
    try {
      const res = await this._get("/api/v6/dex/aggregator/supported/chain");
      return res?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getSupportedChains error:", e.response?.data?.msg || e.message);
      return [];
    }
  }

  // ─── Market Module ─────────────────────────────────────

  /** Get token detail and price */
  async getTokenPrice(tokenAddress) {
    try {
      const res = await this._get("/api/v5/wallet/token/token-detail", {
        chainIndex: XLAYER_CHAIN_ID,
        tokenAddress: tokenAddress || "",
      });
      return res?.data?.[0] || null;
    } catch (e) {
      console.error("[OnchainOS] getTokenPrice error:", e.response?.data?.msg || e.message);
      return null;
    }
  }

  /** Search token by name or symbol */
  async searchToken(query) {
    try {
      const res = await this._get("/api/v5/wallet/token/search-by-address", {
        keyword: query,
        chainIndex: XLAYER_CHAIN_ID,
      });
      return res?.data || [];
    } catch (e) {
      console.error("[OnchainOS] searchToken error:", e.response?.data?.msg || e.message);
      return [];
    }
  }

  /** Get DeFi positions for an address */
  async getDeFiPositions(address) {
    const addr = address || this.walletAddress;
    if (!addr) return [];
    try {
      const res = await this._get("/api/v5/defi/positions", {
        address: addr,
        chainIndex: XLAYER_CHAIN_ID,
      });
      return res?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getDeFiPositions error:", e.response?.data?.msg || e.message);
      return [];
    }
  }

  // ─── Security Module (V6) ─────────────────────────────

  /** Scan token for security risks via POST */
  async scanToken(tokenAddress) {
    try {
      const res = await this._post("/api/v6/security/token-scan", {
        source: "api",
        tokenList: [{ chainId: XLAYER_CHAIN_ID, contractAddress: tokenAddress }],
      });
      return res?.data?.[0] || null;
    } catch (e) {
      console.error("[OnchainOS] scanToken error:", e.response?.data?.msg || e.message);
      return null;
    }
  }

  /** Scan contract/approval for risks */
  async scanContract(contractAddress) {
    try {
      const res = await this._get("/api/v6/dex/pre-transaction/approve-security", {
        chainIndex: XLAYER_CHAIN_ID,
        approveAddress: contractAddress,
      });
      return res?.data?.[0] || null;
    } catch (e) {
      console.error("[OnchainOS] scanContract error:", e.response?.data?.msg || e.message);
      return null;
    }
  }

  // ─── x402 Payment Module ───────────────────────────────

  // USDT on X Layer (6 decimals)
  static USDT_ADDRESS = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d";
  static USDT_DECIMALS = 6;

  // ERC-20 Transfer event signature: Transfer(address,address,uint256)
  static TRANSFER_EVENT_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  /**
   * Build x402 payment request describing what the caller must pay.
   * Returns a structured payment request that the caller can inspect
   * before deciding to sign.
   */
  createPaymentRequest({ amount, recipient, memo, serviceId }) {
    const amountRaw = String(
      Math.round(parseFloat(amount) * 10 ** OnchainOSClient.USDT_DECIMALS)
    );
    return {
      x402Version: 2,
      network: `eip155:${XLAYER_CHAIN_ID}`,
      asset: OnchainOSClient.USDT_ADDRESS,
      decimals: OnchainOSClient.USDT_DECIMALS,
      amountHuman: amount,
      amountRaw,
      payTo: recipient,
      serviceId: serviceId || null,
      memo,
      maxTimeoutSeconds: 300,
      timestamp: Date.now(),
    };
  }

  /**
   * Build a ready-to-broadcast ERC-20 transfer transaction.
   * Uses the standard `transfer(address,uint256)` ABI encoding so the
   * caller only needs to sign and send. Does NOT require a private key
   * on the server side.
   *
   * @param {Object}  opts
   * @param {string}  opts.from       - Sender (caller) address
   * @param {string}  opts.to         - Payment recipient address
   * @param {string}  opts.amount     - Human-readable amount (e.g. "0.01")
   * @param {string}  [opts.gasLimit] - Optional gas limit override
   * @returns {Object} Raw transaction fields ready for signing
   */
  executePayment({ from, to, amount, gasLimit = "60000" }) {
    const amountRaw = BigInt(
      Math.round(parseFloat(amount) * 10 ** OnchainOSClient.USDT_DECIMALS)
    );

    // ABI-encode transfer(address,uint256)
    // Function selector: 0xa9059cbb
    const selector = "a9059cbb";
    const paddedTo = to.toLowerCase().replace("0x", "").padStart(64, "0");
    const paddedAmount = amountRaw.toString(16).padStart(64, "0");
    const data = "0x" + selector + paddedTo + paddedAmount;

    return {
      from,
      to: OnchainOSClient.USDT_ADDRESS,
      value: "0x0",
      data,
      chainId: XLAYER_CHAIN_ID,
      gasLimit,
      description: `ERC-20 transfer: ${amount} USDT to ${to}`,
    };
  }

  /**
   * Verify that a payment actually occurred on-chain by inspecting
   * the transaction receipt logs for a Transfer event matching the
   * expected recipient and amount.
   *
   * @param {Object}  opts
   * @param {string}  opts.txHash          - Transaction hash to verify
   * @param {string}  opts.expectedTo      - Expected payment recipient
   * @param {string}  opts.expectedAmount  - Expected human-readable amount
   * @returns {Object} Verification result with `verified` boolean
   */
  async verifyPaymentOnChain({ txHash, expectedTo, expectedAmount }) {
    try {
      const res = await this._get("/api/v5/wallet/post-transaction/tx-detail", {
        chainIndex: XLAYER_CHAIN_ID,
        txHash,
      });
      const txDetail = res?.data;
      if (!txDetail) {
        return { verified: false, reason: "Transaction not found", txHash };
      }

      const expectedAmountRaw = BigInt(
        Math.round(parseFloat(expectedAmount) * 10 ** OnchainOSClient.USDT_DECIMALS)
      );

      // Walk through logs looking for a matching ERC-20 Transfer event
      const logs = txDetail.logs || txDetail.tokenTransferDetails || [];
      for (const log of logs) {
        // Support both raw log format and pre-parsed token transfer format
        const isUSDT =
          (log.address || log.tokenContractAddress || "").toLowerCase() ===
          OnchainOSClient.USDT_ADDRESS.toLowerCase();
        if (!isUSDT) continue;

        // Pre-parsed format (tokenTransferDetails)
        if (log.to && log.amount) {
          const toMatch =
            log.to.toLowerCase() === expectedTo.toLowerCase();
          const amountMatch =
            BigInt(log.amount) === expectedAmountRaw;
          if (toMatch && amountMatch) {
            return {
              verified: true,
              txHash,
              from: log.from,
              to: log.to,
              amount: expectedAmount,
              amountRaw: expectedAmountRaw.toString(),
            };
          }
          continue;
        }

        // Raw log format with topics
        const topics = log.topics || [];
        if (
          topics.length >= 3 &&
          topics[0] === OnchainOSClient.TRANSFER_EVENT_TOPIC
        ) {
          const logTo =
            "0x" + (topics[2] || "").slice(-40).toLowerCase();
          const logAmount = log.data ? BigInt(log.data) : BigInt(0);

          const toMatch =
            logTo === expectedTo.toLowerCase();
          const amountMatch = logAmount === expectedAmountRaw;

          if (toMatch && amountMatch) {
            const logFrom =
              "0x" + (topics[1] || "").slice(-40).toLowerCase();
            return {
              verified: true,
              txHash,
              from: logFrom,
              to: logTo,
              amount: expectedAmount,
              amountRaw: expectedAmountRaw.toString(),
            };
          }
        }
      }

      return {
        verified: false,
        reason: "No matching USDT transfer found in transaction logs",
        txHash,
      };
    } catch (e) {
      console.error(
        "[OnchainOS] verifyPaymentOnChain error:",
        e.response?.data?.msg || e.message
      );
      return { verified: false, reason: e.message, txHash };
    }
  }

  /**
   * Legacy verify method - fetches raw transaction detail.
   * Prefer verifyPaymentOnChain for structured verification.
   */
  async verifyPayment(txHash) {
    try {
      const res = await this._get("/api/v5/wallet/post-transaction/tx-detail", {
        chainIndex: XLAYER_CHAIN_ID,
        txHash,
      });
      return res?.data || null;
    } catch (e) {
      console.error("[OnchainOS] verifyPayment error:", e.response?.data?.msg || e.message);
      return null;
    }
  }
}

export default OnchainOSClient;
