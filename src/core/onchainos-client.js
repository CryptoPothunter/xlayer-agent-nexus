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
    try {
      const res = await this._get("/api/v5/wallet/asset/token-balances-by-address", {
        address: addr,
        chainIndex: XLAYER_CHAIN_ID,
      });
      return res?.data || [];
    } catch (e) {
      // Fallback: try portfolio endpoint
      try {
        const res2 = await this._get("/api/v5/wallet/asset/all-token-balances-by-address", {
          address: addr,
          chainIndex: XLAYER_CHAIN_ID,
        });
        return res2?.data || [];
      } catch {
        console.error("[OnchainOS] getBalances error:", e.response?.data?.msg || e.message);
        return [];
      }
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

  /** Build x402 payment payload (EIP-3009) */
  async createPaymentRequest({ amount, token, recipient, memo }) {
    return {
      x402Version: 2,
      accepts: [
        {
          network: `eip155:${XLAYER_CHAIN_ID}`,
          amount,
          payTo: recipient,
          asset: token,
          maxTimeoutSeconds: 300,
        },
      ],
      memo,
      timestamp: Date.now(),
    };
  }

  /** Verify x402 payment on-chain */
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
