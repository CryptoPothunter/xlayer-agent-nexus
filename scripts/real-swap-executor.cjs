/**
 * Real Token Swap Executor for X Layer
 *
 * Executes a REAL token swap on X Layer via the OKX OnchainOS DEX Aggregator API (V6).
 * Uses ethers.js directly (no hardhat) and native Node.js crypto for HMAC signing.
 *
 * Swap: 0.001 OKB (native) -> USDT
 * On success, records a service call on the ServiceRegistry contract.
 */

const crypto = require("crypto");
const { ethers } = require("ethers");
require("dotenv").config();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const XLAYER_CHAIN_ID = 196;
const XLAYER_RPC = "https://rpc.xlayer.tech";
const EXPLORER_BASE = "https://www.okx.com/explorer/xlayer/tx/";

// Token addresses
const NATIVE_OKB = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d";
const WETH = "0x5A77f1443D16ee5761d310e38b62f77f726bC71c";
const WOKB = "0xe538905cf8410324e03A5A23C1c177a474D59b2b";

// Swap parameters
const SWAP_AMOUNT_OKB = "0.001"; // human-readable
const SWAP_AMOUNT_WEI = ethers.parseEther(SWAP_AMOUNT_OKB).toString(); // 18 decimals for native OKB
const SLIPPAGE = "0.005"; // 0.5%

// ServiceRegistry
const SERVICE_REGISTRY_ADDRESS = "0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4";
const SERVICE_REGISTRY_ABI = [
  "function recordServiceCall(bytes32 serviceId, address caller) external",
  "function allServiceIds(uint256) view returns (bytes32)",
  "function getServiceCount() view returns (uint256)",
];

// OKX DEX API
const OKX_BASE_URL = "https://www.okx.com";
const QUOTE_PATH = "/api/v5/dex/aggregator/quote";
const SWAP_PATH = "/api/v5/dex/aggregator/swap";

// Deployer wallet
const DEPLOYER_ADDRESS = "0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5";

// ---------------------------------------------------------------------------
// OKX API HMAC-SHA256 signing
// ---------------------------------------------------------------------------

function signRequest(timestamp, method, path, queryString, body = "") {
  const prehash =
    timestamp + method + path + (queryString ? "?" + queryString : "") + body;
  return crypto
    .createHmac("sha256", process.env.OKX_SECRET_KEY)
    .update(prehash)
    .digest("base64");
}

// ---------------------------------------------------------------------------
// OKX API helpers
// ---------------------------------------------------------------------------

function buildHeaders(method, path, queryString, body = "") {
  const timestamp = new Date().toISOString();
  const sign = signRequest(timestamp, method, path, queryString, body);
  return {
    "OK-ACCESS-KEY": process.env.OKX_API_KEY,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": process.env.OKX_PASSPHRASE,
    "OK-ACCESS-PROJECT": process.env.OKX_PROJECT_ID,
    "Content-Type": "application/json",
  };
}

async function okxGet(path, params) {
  const queryString = new URLSearchParams(params).toString();
  const headers = buildHeaders("GET", path, queryString);
  const url = `${OKX_BASE_URL}${path}?${queryString}`;

  console.log(`  -> GET ${path}`);
  const res = await fetch(url, { method: "GET", headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OKX API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.code !== "0" && json.code !== 0) {
    throw new Error(
      `OKX API returned code ${json.code}: ${json.msg || JSON.stringify(json)}`
    );
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Quote & Swap helpers
// ---------------------------------------------------------------------------

async function getQuote() {
  console.log("\n[1/4] Fetching quote for swap...");
  const params = {
    chainId: String(XLAYER_CHAIN_ID),
    fromTokenAddress: NATIVE_OKB,
    toTokenAddress: USDT,
    amount: SWAP_AMOUNT_WEI,
    slippage: SLIPPAGE,
  };

  const data = await okxGet(QUOTE_PATH, params);
  if (!data || data.length === 0) {
    throw new Error("No quote data returned from OKX DEX API");
  }

  const quote = data[0];
  const toAmount = quote.toTokenAmount;
  const toDecimals = parseInt(quote.toToken?.decimals || "6", 10);
  const humanAmount = (Number(toAmount) / 10 ** toDecimals).toFixed(toDecimals);

  console.log(`  Quote: ${SWAP_AMOUNT_OKB} OKB -> ${humanAmount} USDT`);
  if (quote.estimateGasFee) {
    console.log(`  Estimated gas fee: ${quote.estimateGasFee}`);
  }
  return quote;
}

async function getSwapData(walletAddress) {
  console.log("\n[2/4] Fetching swap transaction data...");
  const params = {
    chainId: String(XLAYER_CHAIN_ID),
    fromTokenAddress: NATIVE_OKB,
    toTokenAddress: USDT,
    amount: SWAP_AMOUNT_WEI,
    slippage: SLIPPAGE,
    userWalletAddress: walletAddress,
  };

  const data = await okxGet(SWAP_PATH, params);
  if (!data || data.length === 0) {
    throw new Error("No swap data returned from OKX DEX API");
  }

  const swap = data[0];
  if (!swap.tx) {
    throw new Error("Swap response missing tx object: " + JSON.stringify(swap));
  }

  console.log(`  Router: ${swap.routerResult?.toTokenAmount ? "OK" : "N/A"}`);
  console.log(`  To:     ${swap.tx.to}`);
  console.log(`  Value:  ${swap.tx.value}`);
  return swap;
}

// ---------------------------------------------------------------------------
// ServiceRegistry helper
// ---------------------------------------------------------------------------

async function recordServiceCallOnRegistry(wallet) {
  console.log("\n[4/4] Recording service call on ServiceRegistry...");
  try {
    const registry = new ethers.Contract(
      SERVICE_REGISTRY_ADDRESS,
      SERVICE_REGISTRY_ABI,
      wallet
    );

    // Look up the SwapOptimizer service ID from the registry
    const serviceCount = await registry.getServiceCount();
    console.log(`  ServiceRegistry has ${serviceCount} service(s)`);

    let swapServiceId = null;
    for (let i = 0; i < serviceCount; i++) {
      const sid = await registry.allServiceIds(i);
      // Check if this is the SwapOptimizer service (keccak256 of "SwapOptimizer")
      const expected = ethers.id("SwapOptimizer");
      if (sid === expected) {
        swapServiceId = sid;
        break;
      }
    }

    if (!swapServiceId) {
      // Fallback: use keccak256("SwapOptimizer") directly
      swapServiceId = ethers.id("SwapOptimizer");
      console.log("  SwapOptimizer service ID not found in registry, using computed hash");
    }

    console.log(`  Service ID: ${swapServiceId}`);
    const tx = await registry.recordServiceCall(swapServiceId, wallet.address);
    console.log(`  Recording tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  Confirmed in block ${receipt.blockNumber}`);
    console.log(`  Explorer: ${EXPLORER_BASE}${tx.hash}`);
  } catch (err) {
    console.error("  WARNING: Failed to record service call:", err.message);
    console.error("  (The swap itself was successful, this is a non-critical step)");
  }
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("  X Layer Real Swap Executor");
  console.log("  OKX OnchainOS DEX Aggregator V6");
  console.log("=".repeat(60));

  // --- Validate environment ---
  const required = [
    "OKX_API_KEY",
    "OKX_SECRET_KEY",
    "OKX_PASSPHRASE",
    "OKX_PROJECT_ID",
    "PRIVATE_KEY",
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // --- Connect to X Layer ---
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC, {
    name: "xlayer",
    chainId: XLAYER_CHAIN_ID,
  });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log(`\nWallet:   ${wallet.address}`);
  if (wallet.address.toLowerCase() !== DEPLOYER_ADDRESS.toLowerCase()) {
    console.log(`  WARNING: Wallet address does not match expected deployer ${DEPLOYER_ADDRESS}`);
  }

  // --- Check OKB balance ---
  const balance = await provider.getBalance(wallet.address);
  const balanceOKB = ethers.formatEther(balance);
  console.log(`OKB balance: ${balanceOKB} OKB`);

  if (balance < ethers.parseEther(SWAP_AMOUNT_OKB)) {
    throw new Error(
      `Insufficient OKB balance. Need at least ${SWAP_AMOUNT_OKB} OKB, have ${balanceOKB}`
    );
  }

  // --- Step 1: Get quote ---
  const quote = await getQuote();

  // --- Step 2: Get swap transaction data ---
  const swapData = await getSwapData(wallet.address);

  // --- Step 3: Sign and broadcast ---
  console.log("\n[3/4] Signing and broadcasting swap transaction...");
  const tx = swapData.tx;
  const txRequest = {
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value || "0"),
    gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
    gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
  };

  // If no gas limit was provided, estimate it
  if (!txRequest.gasLimit) {
    console.log("  Estimating gas...");
    const estimated = await provider.estimateGas({
      ...txRequest,
      from: wallet.address,
    });
    txRequest.gasLimit = (estimated * 120n) / 100n; // +20% buffer
    console.log(`  Estimated gas: ${estimated}, using: ${txRequest.gasLimit}`);
  }

  console.log("  Broadcasting transaction...");
  const sentTx = await wallet.sendTransaction(txRequest);
  console.log(`  Tx hash: ${sentTx.hash}`);
  console.log(`  Waiting for confirmation...`);

  const receipt = await sentTx.wait();
  console.log(`  Confirmed in block ${receipt.blockNumber}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);
  console.log(`  Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);

  if (receipt.status !== 1) {
    throw new Error("Swap transaction reverted on chain");
  }

  console.log(`\n  Transaction: ${sentTx.hash}`);
  console.log(`  Explorer:    ${EXPLORER_BASE}${sentTx.hash}`);

  // --- Step 4: Record service call ---
  await recordServiceCallOnRegistry(wallet);

  console.log("\n" + "=".repeat(60));
  console.log("  Swap completed successfully!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nFATAL:", error.message || error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
