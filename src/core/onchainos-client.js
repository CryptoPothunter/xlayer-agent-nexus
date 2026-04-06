/**
 * OnchainOS Client - Unified interface to OKX Onchain OS APIs
 * Covers: Wallet, DEX, Market, Security modules
 */
import axios from "axios";

const ONCHAINOS_BASE = "https://web3.okx.com/api/v1";
const XLAYER_CHAIN_ID = "196";

export class OnchainOSClient {
  constructor({ apiKey, projectId, walletAddress }) {
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.walletAddress = walletAddress;
    this.http = axios.create({
      baseURL: ONCHAINOS_BASE,
      headers: {
        "Content-Type": "application/json",
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-PROJECT": projectId,
      },
      timeout: 30000,
    });
  }

  // ─── Wallet Module ─────────────────────────────────────

  /** Get wallet token balances on X Layer */
  async getBalances(address) {
    const addr = address || this.walletAddress;
    try {
      const res = await this.http.get("/wallet/asset/token-balances", {
        params: { address: addr, chainIndex: XLAYER_CHAIN_ID },
      });
      return res.data?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getBalances error:", e.message);
      return [];
    }
  }

  /** Get wallet transaction history */
  async getTransactionHistory(address, limit = 20) {
    const addr = address || this.walletAddress;
    try {
      const res = await this.http.get("/wallet/post-transaction/transactions", {
        params: { address: addr, chainIndex: XLAYER_CHAIN_ID, limit },
      });
      return res.data?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getTransactionHistory error:", e.message);
      return [];
    }
  }

  // ─── DEX Module ────────────────────────────────────────

  /** Get swap quote from DEX aggregator (500+ liquidity sources) */
  async getSwapQuote({ fromToken, toToken, amount, slippage = "0.5" }) {
    try {
      const res = await this.http.get("/dex/aggregator/quote", {
        params: {
          chainId: XLAYER_CHAIN_ID,
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount,
          slippage,
        },
      });
      return res.data?.data?.[0] || null;
    } catch (e) {
      console.error("[OnchainOS] getSwapQuote error:", e.message);
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
      const res = await this.http.get("/dex/aggregator/swap", {
        params: {
          chainId: XLAYER_CHAIN_ID,
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount,
          slippage,
          userWalletAddress: addr,
        },
      });
      return res.data?.data?.[0] || null;
    } catch (e) {
      console.error("[OnchainOS] getSwapTransaction error:", e.message);
      return null;
    }
  }

  /** Get supported tokens on X Layer */
  async getTokenList() {
    try {
      const res = await this.http.get("/dex/aggregator/all-tokens", {
        params: { chainId: XLAYER_CHAIN_ID },
      });
      return res.data?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getTokenList error:", e.message);
      return [];
    }
  }

  // ─── Market Module ─────────────────────────────────────

  /** Get token price */
  async getTokenPrice(tokenAddress) {
    try {
      const res = await this.http.get("/market/token/price", {
        params: {
          chainIndex: XLAYER_CHAIN_ID,
          tokenAddress,
        },
      });
      return res.data?.data || null;
    } catch (e) {
      console.error("[OnchainOS] getTokenPrice error:", e.message);
      return null;
    }
  }

  /** Search token by name or symbol */
  async searchToken(query) {
    try {
      const res = await this.http.get("/market/token/search", {
        params: { keyword: query, chainIndex: XLAYER_CHAIN_ID },
      });
      return res.data?.data || [];
    } catch (e) {
      console.error("[OnchainOS] searchToken error:", e.message);
      return [];
    }
  }

  /** Get DeFi positions for an address */
  async getDeFiPositions(address) {
    const addr = address || this.walletAddress;
    try {
      const res = await this.http.get("/defi/positions", {
        params: { address: addr, chainIndex: XLAYER_CHAIN_ID },
      });
      return res.data?.data || [];
    } catch (e) {
      console.error("[OnchainOS] getDeFiPositions error:", e.message);
      return [];
    }
  }

  // ─── Security Module ───────────────────────────────────

  /** Scan token for security risks */
  async scanToken(tokenAddress) {
    try {
      const res = await this.http.get("/security/token-scan", {
        params: {
          chainIndex: XLAYER_CHAIN_ID,
          tokenAddress,
        },
      });
      return res.data?.data || null;
    } catch (e) {
      console.error("[OnchainOS] scanToken error:", e.message);
      return null;
    }
  }

  /** Scan contract address */
  async scanContract(contractAddress) {
    try {
      const res = await this.http.get("/security/contract-scan", {
        params: {
          chainIndex: XLAYER_CHAIN_ID,
          contractAddress,
        },
      });
      return res.data?.data || null;
    } catch (e) {
      console.error("[OnchainOS] scanContract error:", e.message);
      return null;
    }
  }

  // ─── x402 Payment Module ───────────────────────────────

  /** Create x402 payment request */
  async createPaymentRequest({ amount, token, recipient, memo }) {
    return {
      protocol: "x402",
      version: "1.0",
      chainId: XLAYER_CHAIN_ID,
      amount,
      token,
      recipient,
      memo,
      timestamp: Date.now(),
    };
  }

  /** Verify x402 payment on-chain */
  async verifyPayment(txHash) {
    try {
      const res = await this.http.get("/wallet/post-transaction/tx-detail", {
        params: { chainIndex: XLAYER_CHAIN_ID, txHash },
      });
      return res.data?.data || null;
    } catch (e) {
      console.error("[OnchainOS] verifyPayment error:", e.message);
      return null;
    }
  }
}

export default OnchainOSClient;
