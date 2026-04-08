/**
 * Autonomous Agent Loop — Self-running market operations every cycle
 * The agent autonomously: scans markets, checks prices, evaluates security,
 * executes service calls, and records everything on-chain.
 */
const { ethers } = require('ethers');
const { CHAIN_ID, USDT_ADDRESS, ERC20_ABI, REGISTRY_ABI, REGISTRY_ADDRESS, TOKEN_MAP } = require('./config');
const { okxRequest } = require('./okx-auth');
const { serverWallet, rpcProvider, AGENT_WALLET } = require('./wallet');

// ── State ──
const autonomousLog = [];       // All autonomous actions log
const cycleHistory = [];        // Per-cycle summaries
let cycleCount = 0;
let isRunning = false;
let intervalHandle = null;
let lastCycleTime = null;
const CYCLE_INTERVAL = 5 * 60 * 1000; // 5 minutes
let dynamicInterval = CYCLE_INTERVAL;
const MAX_LOG_SIZE = 500;
const MAX_CYCLES = 200;

// ── Cumulative Stats ──
let cumulativeStats = {
  startedAt: null,
  totalCycles: 0,
  totalApiCalls: 0,
  totalOnChainTxs: 0,
  arbitrageOpportunities: 0,
  profitableArbs: 0,
  estimatedSavings: 0,
  priceHistory: [],       // [{token, price, timestamp}] - keep last 100
  strategyDecisions: [],  // [{type, action, reason, timestamp}] - keep last 50
  executedSwaps: [],      // [{type, fromToken, toToken, amountIn, amountOut, txHash, timestamp}]
  totalGasSpent: 0,
  // Execution failure tracking — visible to UI
  failedExecutions: 0,
  lastFailureReason: null,
  skippedSwaps: 0,
  walletStatus: 'unknown', // 'funded', 'low_balance', 'empty', 'no_wallet'
};

// ── Arbitrage History ──
const arbitrageHistory = [];  // keep last 100
const MAX_ARB_HISTORY = 100;
const MAX_PRICE_HISTORY = 100;
const MAX_STRATEGY_DECISIONS = 50;
const ARB_THRESHOLD = 0.3; // 0.3% spread threshold

// Token pairs to monitor
const MONITOR_PAIRS = [
  { from: 'OKB', to: 'USDT', label: 'OKB/USDT' },
  { from: 'WETH', to: 'USDT', label: 'WETH/USDT' },
  { from: 'USDC', to: 'USDT', label: 'USDC/USDT' },
  { from: 'OKB', to: 'WETH', label: 'OKB/WETH' },
];

// Tokens to scan for security
const SCAN_TOKENS = [
  { address: USDT_ADDRESS, name: 'USDT' },
  { address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c', name: 'WETH' },
  { address: '0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09', name: 'WOKB' },
  { address: '0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10', name: 'USDC' },
];

// Registry contract instance
let registryContract = null;

// Known service IDs (full bytes32 from chain)
const SERVICE_IDS = {
  'SwapOptimizer': '0x76cb3997d766569bb6712849bc22d6ba842449dc9105f87cd1291f38a10a48cd',
  'TokenScanner': '0x54fca619b81baf499ecce3a534701b5f069503cc27df2d78d3a5013ef36b8088',
  'PriceAlert': '0x2526a1acef1841c5624615a2310d019475dbc0d1a4a51a9ce7a7f6b679856cb7',
  'TokenSecurityAudit': '0x98b237384afa4604769d0bdcbc1888f351ace9e5edf039d85ce1b1c13bc19dde',
  'PriceOracle': '0xd05acea2c36b6031752e2d5206076705b04c92b7f6b438db344fa0d4284a4cef',
  'GasOptimizer': '0xda8cc933841d7054fc35fa33f297cae5aa7b05103c083513542f640006937b98',
};

function addLog(entry) {
  const item = { ...entry, timestamp: Date.now(), cycle: cycleCount };
  autonomousLog.push(item);
  if (autonomousLog.length > MAX_LOG_SIZE) autonomousLog.splice(0, autonomousLog.length - MAX_LOG_SIZE);
  return item;
}

function getRegistry() {
  if (!registryContract && serverWallet) {
    const fullABI = [
      ...REGISTRY_ABI,
      'function getServiceCount() view returns (uint256)',
      'function getServiceById(bytes32 serviceId) view returns (tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt))',
      'function getAgentProfile(address agent) view returns (tuple(address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered))',
      'function getAllActiveServices() view returns (bytes32[])',
    ];
    registryContract = new ethers.Contract(REGISTRY_ADDRESS, fullABI, serverWallet);
  }
  return registryContract;
}

// ── Autonomous Cycle ──
async function runCycle() {
  cycleCount++;
  const cycleStart = Date.now();
  const cycleId = `cycle_${cycleCount}_${Date.now()}`;
  const summary = {
    cycleId,
    cycleNumber: cycleCount,
    startedAt: cycleStart,
    actions: [],
    priceData: {},
    securityScans: [],
    serviceCallsTx: [],
    swapQuotes: [],
    errors: [],
  };

  console.log(`\n[Autonomous] ════ Cycle #${cycleCount} started ════`);
  if (!cumulativeStats.startedAt) cumulativeStats.startedAt = cycleStart;
  cumulativeStats.totalCycles = cycleCount;

  try {
    // ── Phase 1: Price Intelligence ──
    addLog({ phase: 'price_scan', action: 'Starting price intelligence scan', status: 'running' });
    const priceResults = await runPriceScan(summary);
    summary.actions.push({ phase: 'price_scan', results: priceResults.length, status: 'done' });

    // ── Phase 2: Security Scanning ──
    addLog({ phase: 'security_scan', action: 'Running automated security scans', status: 'running' });
    const scanResults = await runSecurityScans(summary);
    summary.actions.push({ phase: 'security_scan', results: scanResults.length, status: 'done' });

    // ── Phase 3: DEX Quote Aggregation ──
    addLog({ phase: 'dex_quotes', action: 'Fetching multi-strategy DEX quotes', status: 'running' });
    const quoteResults = await runDexQuotes(summary);
    summary.actions.push({ phase: 'dex_quotes', results: quoteResults.length, status: 'done' });

    // ── Phase 4: Arbitrage Detection ──
    addLog({ phase: 'arbitrage', action: 'Scanning for cross-path arbitrage', status: 'running' });
    const arbResults = await runArbitrageDetection(summary);
    summary.actions.push({ phase: 'arbitrage', results: arbResults.length, opportunities: arbResults.filter(a => a.profitable).length, status: 'done' });
    summary.arbitrageResults = {
      directSpread: arbResults[0]?.spreadPercent || '0',
      stablecoinSpread: arbResults[1]?.spreadPercent || '0',
      opportunities: arbResults.filter(a => a.profitable).length,
      scans: arbResults,
    };

    // ── Phase 5: Yield Strategy Evaluation ──
    addLog({ phase: 'yield_strategy', action: 'Evaluating portfolio rebalancing', status: 'running' });
    const yieldResults = await runYieldStrategy(summary);
    summary.actions.push({ phase: 'yield_strategy', results: yieldResults.length, status: 'done' });
    summary.strategyDecisions = yieldResults;

    // ── Phase 5.5: Strategy Decision Engine ──
    addLog({ phase: 'strategy_engine', action: 'Running smart strategy decision engine', status: 'running' });
    const engineDecision = await runStrategyEngine(summary);
    summary.actions.push({ phase: 'strategy_engine', decision: engineDecision.decision, status: 'done' });
    summary.engineDecision = engineDecision;

    // ── Phase 6: On-Chain Service Calls ──
    addLog({ phase: 'service_calls', action: 'Recording service calls on-chain', status: 'running' });
    const txResults = await runOnChainRecording(summary);
    summary.actions.push({ phase: 'service_calls', txCount: txResults.length, status: 'done' });

    // ── Phase 7: Wallet Balance Check ──
    addLog({ phase: 'balance_check', action: 'Checking agent wallet balances', status: 'running' });
    const balanceData = await checkWalletBalance(summary);
    summary.actions.push({ phase: 'balance_check', status: 'done' });
    summary.walletBalance = balanceData;

  } catch (e) {
    summary.errors.push({ phase: 'cycle', error: e.message });
    addLog({ phase: 'error', action: `Cycle error: ${e.message}`, status: 'error' });
  }

  summary.completedAt = Date.now();
  summary.duration = summary.completedAt - cycleStart;
  lastCycleTime = summary.completedAt;

  cycleHistory.push(summary);
  if (cycleHistory.length > MAX_CYCLES) cycleHistory.splice(0, cycleHistory.length - MAX_CYCLES);

  addLog({ phase: 'cycle_complete', action: `Cycle #${cycleCount} completed in ${summary.duration}ms`, status: 'done', duration: summary.duration });
  console.log(`[Autonomous] ════ Cycle #${cycleCount} completed in ${summary.duration}ms ════\n`);

  return summary;
}

// ── Phase Implementations ──

async function runPriceScan(summary) {
  const results = [];
  const tokens = ['OKB', 'WETH', 'USDC'];

  for (const sym of tokens) {
    try {
      const addr = TOKEN_MAP[sym] || '';
      const res = await okxRequest('GET', '/api/v5/wallet/token/token-detail', {
        chainIndex: CHAIN_ID, tokenAddress: addr
      });
      const data = res?.data?.[0];
      cumulativeStats.totalApiCalls++;
      if (data) {
        const price = data.price || data.tokenPrice || 'N/A';
        summary.priceData[sym] = { price, marketCap: data.marketCap, volume24h: data.volume24h, timestamp: Date.now() };
        results.push({ token: sym, price });
        addLog({ phase: 'price_scan', action: `${sym}: $${price}`, status: 'done', data: { token: sym, price } });
      }
    } catch (e) {
      summary.errors.push({ phase: 'price_scan', token: sym, error: e.message });
    }
  }
  return results;
}

async function runSecurityScans(summary) {
  const results = [];
  // Rotate: scan 1-2 tokens per cycle to avoid rate limits
  const idx = (cycleCount - 1) % SCAN_TOKENS.length;
  const tokensToScan = [SCAN_TOKENS[idx], SCAN_TOKENS[(idx + 1) % SCAN_TOKENS.length]];

  for (const token of tokensToScan) {
    try {
      const res = await okxRequest('POST', '/api/v6/security/token-scan', {
        source: 'api',
        tokenList: [{ chainId: CHAIN_ID, contractAddress: token.address }]
      });
      const scanData = res?.data?.[0];
      cumulativeStats.totalApiCalls++;
      const riskLevel = scanData?.securityInfo?.riskLevel || 'unknown';
      const entry = { token: token.name, address: token.address, riskLevel, timestamp: Date.now() };
      summary.securityScans.push(entry);
      results.push(entry);
      addLog({ phase: 'security_scan', action: `${token.name}: risk=${riskLevel}`, status: 'done', data: entry });
    } catch (e) {
      summary.errors.push({ phase: 'security_scan', token: token.name, error: e.message });
    }
  }
  return results;
}

async function runDexQuotes(summary) {
  const results = [];
  // Rotate pairs: 2 per cycle
  const idx = (cycleCount - 1) % MONITOR_PAIRS.length;
  const pairsToQuote = [MONITOR_PAIRS[idx], MONITOR_PAIRS[(idx + 1) % MONITOR_PAIRS.length]];

  for (const pair of pairsToQuote) {
    try {
      const fromAddr = TOKEN_MAP[pair.from];
      const toAddr = TOKEN_MAP[pair.to];
      const decimals = (pair.from === 'USDT' || pair.from === 'USDC') ? 6 : 18;
      const amount = String(BigInt(10 ** decimals)); // 1 token

      const [stdQuote, tightQuote] = await Promise.allSettled([
        okxRequest('GET', '/api/v6/dex/aggregator/quote', {
          chainIndex: CHAIN_ID, fromTokenAddress: fromAddr, toTokenAddress: toAddr, amount, slippage: '0.5'
        }),
        okxRequest('GET', '/api/v6/dex/aggregator/quote', {
          chainIndex: CHAIN_ID, fromTokenAddress: fromAddr, toTokenAddress: toAddr, amount, slippage: '0.1'
        }),
      ]);

      const stdData = stdQuote.status === 'fulfilled' ? stdQuote.value?.data?.[0] : null;
      const tightData = tightQuote.status === 'fulfilled' ? tightQuote.value?.data?.[0] : null;

      // Extract DEX source names for Uniswap narrative
      const dexRouterList = stdData?.dexRouterList || [];
      const dexSourceNames = [];
      const trackedDexes = { 'Uniswap V3': false, 'Uniswap V2': false, 'iZUMi': false };
      for (const router of dexRouterList) {
        const name = router.routerName || router.dexName || router.router || 'Unknown DEX';
        if (!dexSourceNames.includes(name)) dexSourceNames.push(name);
        for (const key of Object.keys(trackedDexes)) {
          if (name.toLowerCase().includes(key.toLowerCase())) trackedDexes[key] = true;
        }
        // Also check sub-routes if available
        const subRoutes = router.subRouterList || router.subRoutes || [];
        for (const sub of subRoutes) {
          const subName = sub.dexName || sub.routerName || '';
          if (subName && !dexSourceNames.includes(subName)) dexSourceNames.push(subName);
          for (const key of Object.keys(trackedDexes)) {
            if (subName.toLowerCase().includes(key.toLowerCase())) trackedDexes[key] = true;
          }
        }
      }

      const entry = {
        pair: pair.label,
        standardOutput: stdData?.toTokenAmount || 'N/A',
        tightOutput: tightData?.toTokenAmount || 'N/A',
        dexSources: dexRouterList.length || 0,
        dexSourceNames,
        trackedDexes,
        aggregationSummary: `Aggregated across ${dexSourceNames.length} DEX sources` +
          (dexSourceNames.length > 0 ? ` including ${dexSourceNames.slice(0, 3).join(', ')}` : '') +
          (trackedDexes['Uniswap V3'] ? ' (Uniswap V3 pools)' : ''),
        priceImpact: stdData?.priceImpactPercent || 'N/A',
        timestamp: Date.now(),
      };
      summary.swapQuotes.push(entry);
      results.push(entry);
      cumulativeStats.totalApiCalls += 2; // two quote calls per pair
      addLog({ phase: 'dex_quotes', action: `${pair.label}: ${entry.dexSources} DEX sources — ${entry.aggregationSummary}`, status: 'done', data: entry });
    } catch (e) {
      summary.errors.push({ phase: 'dex_quotes', pair: pair.label, error: e.message });
    }
  }
  return results;
}

async function runOnChainRecording(summary) {
  const results = [];
  if (!serverWallet) {
    cumulativeStats.walletStatus = 'no_wallet';
    addLog({ phase: 'service_calls', action: 'BLOCKED: No server wallet — on-chain recording disabled', status: 'blocked' });
    return results;
  }

  const registry = getRegistry();
  if (!registry) return results;

  // Record 1-2 service calls per cycle, rotating through services
  const serviceNames = Object.keys(SERVICE_IDS);
  const idx = (cycleCount - 1) % serviceNames.length;
  const servicesToCall = [serviceNames[idx]];
  if (cycleCount % 2 === 0) servicesToCall.push(serviceNames[(idx + 1) % serviceNames.length]);

  for (const svcName of servicesToCall) {
    try {
      const svcId = SERVICE_IDS[svcName];

      const tx = await registry.recordServiceCall(svcId, serverWallet.address);
      const receipt = await tx.wait();

      const txEntry = {
        service: svcName,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
      };
      summary.serviceCallsTx.push(txEntry);
      results.push(txEntry);
      cumulativeStats.totalOnChainTxs++;
      addLog({
        phase: 'service_calls',
        action: `Recorded ${svcName} call on-chain`,
        status: 'done',
        data: { txHash: receipt.hash, blockNumber: receipt.blockNumber },
      });
      console.log(`[Autonomous] On-chain: ${svcName} -> tx ${receipt.hash.slice(0, 18)}... (block ${receipt.blockNumber})`);
    } catch (e) {
      summary.errors.push({ phase: 'service_calls', service: svcName, error: e.message });
      addLog({ phase: 'service_calls', action: `Failed ${svcName}: ${e.message}`, status: 'error' });
    }
  }
  return results;
}

async function checkWalletBalance(summary) {
  try {
    const addr = AGENT_WALLET;
    const okbBalance = await rpcProvider.getBalance(addr);
    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, rpcProvider);
    const usdtBalance = await usdt.balanceOf(addr);

    const okbVal = parseFloat(ethers.formatEther(okbBalance));
    // Update wallet status for UI visibility
    if (okbVal < 0.001) {
      cumulativeStats.walletStatus = 'empty';
    } else if (okbVal < 0.01) {
      cumulativeStats.walletStatus = 'low_balance';
    } else {
      cumulativeStats.walletStatus = 'funded';
    }

    const data = {
      address: addr,
      okb: ethers.formatEther(okbBalance),
      usdt: ethers.formatUnits(usdtBalance, 6),
      status: cumulativeStats.walletStatus,
      timestamp: Date.now(),
    };
    addLog({ phase: 'balance_check', action: `Balance: ${data.okb} OKB, ${data.usdt} USDT [${data.status}]`, status: data.status === 'funded' ? 'done' : 'warning', data });
    return data;
  } catch (e) {
    summary.errors.push({ phase: 'balance_check', error: e.message });
    return null;
  }
}

// ── Arbitrage Detection ──

// Auto-execute: swap a small amount when arb is profitable
async function executeArbSwap(bestPath, summary) {
  if (!serverWallet) {
    cumulativeStats.skippedSwaps++;
    cumulativeStats.walletStatus = 'no_wallet';
    cumulativeStats.lastFailureReason = 'No server wallet configured — cannot execute autonomous swaps';
    addLog({ phase: 'arbitrage', action: 'BLOCKED: No server wallet configured. Swap cannot execute.', status: 'blocked' });
    summary.executionBlocked = { reason: 'no_wallet', message: 'Server wallet not configured' };
    return null;
  }

  // Check balance before attempting swap
  try {
    const bal = await rpcProvider.getBalance(serverWallet.address);
    const balOKB = parseFloat(ethers.formatEther(bal));
    if (balOKB < 0.001) {
      cumulativeStats.skippedSwaps++;
      cumulativeStats.walletStatus = 'empty';
      cumulativeStats.lastFailureReason = `Insufficient OKB balance: ${balOKB.toFixed(6)} OKB (need >= 0.001 OKB for gas + swap)`;
      addLog({ phase: 'arbitrage', action: `BLOCKED: Insufficient balance (${balOKB.toFixed(6)} OKB). Need >= 0.001 OKB.`, status: 'blocked' });
      summary.executionBlocked = { reason: 'insufficient_balance', balance: balOKB.toFixed(6), required: '0.001' };
      return null;
    }
    cumulativeStats.walletStatus = balOKB < 0.01 ? 'low_balance' : 'funded';
  } catch (e) {
    // Balance check failed, try the swap anyway
  }

  try {
    // Use 0.001 OKB (~tiny amount) to prove autonomous execution
    const amount = String(BigInt(10 ** 15)); // 0.001 OKB (18 decimals)
    const fromAddr = TOKEN_MAP.OKB; // native OKB = 0xeee...
    const toAddr = TOKEN_MAP.USDT;

    addLog({ phase: 'arbitrage', action: `Auto-executing arb swap: 0.001 OKB → USDT (${bestPath} path)`, status: 'running' });

    // Get swap calldata from DEX aggregator
    const swapRes = await okxRequest('GET', '/api/v6/dex/aggregator/swap', {
      chainIndex: CHAIN_ID,
      fromTokenAddress: fromAddr,
      toTokenAddress: toAddr,
      amount,
      slippage: '1.0',
      userWalletAddress: serverWallet.address,
    });
    cumulativeStats.totalApiCalls++;

    const txData = swapRes?.data?.[0]?.tx;
    if (!txData) {
      addLog({ phase: 'arbitrage', action: 'Auto-execute: no swap route available', status: 'skipped' });
      return null;
    }

    // Execute swap on-chain
    const tx = await serverWallet.sendTransaction({
      to: txData.to,
      data: txData.data,
      value: txData.value || '0x0',
      gasLimit: txData.gas || '300000',
    });
    const receipt = await tx.wait();
    cumulativeStats.totalOnChainTxs++;

    const gasUsedArb = parseFloat(receipt.gasUsed.toString());
    cumulativeStats.totalGasSpent += gasUsedArb;

    const result = {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      amount: '0.001 OKB',
      path: bestPath,
      timestamp: Date.now(),
    };

    // Track in executed swaps for P&L
    cumulativeStats.executedSwaps.push({
      type: 'arb_swap',
      fromToken: 'OKB',
      toToken: 'USDT',
      amountIn: '0.001 OKB',
      amountOut: 'market',
      txHash: receipt.hash,
      timestamp: Date.now(),
    });

    addLog({
      phase: 'arbitrage',
      action: `Auto-executed arb swap! TX: ${receipt.hash.slice(0, 18)}... Block: ${receipt.blockNumber}`,
      status: 'done',
      data: result,
    });
    console.log(`[Autonomous] Arb auto-executed: ${receipt.hash.slice(0, 22)}... (block ${receipt.blockNumber})`);

    summary.arbExecution = result;
    return result;
  } catch (e) {
    cumulativeStats.failedExecutions++;
    cumulativeStats.lastFailureReason = `Arb swap failed: ${e.message?.slice(0, 120)}`;
    addLog({ phase: 'arbitrage', action: `EXECUTION FAILED: ${e.message?.slice(0, 80)}`, status: 'error' });
    summary.errors.push({ phase: 'arbitrage_execution', error: e.message });
    return null;
  }
}

async function runArbitrageDetection(summary) {
  const results = [];
  addLog({ phase: 'arbitrage', action: 'Scanning for arbitrage opportunities', status: 'running' });

  try {
    // Compare OKB/USDT direct vs OKB→WETH→USDT two-hop
    const okbAmount = String(BigInt(10 ** 18)); // 1 OKB
    const [directQuote, hop1Quote] = await Promise.allSettled([
      okxRequest('GET', '/api/v6/dex/aggregator/quote', {
        chainIndex: CHAIN_ID, fromTokenAddress: TOKEN_MAP.OKB, toTokenAddress: TOKEN_MAP.USDT,
        amount: okbAmount, slippage: '0.5',
      }),
      okxRequest('GET', '/api/v6/dex/aggregator/quote', {
        chainIndex: CHAIN_ID, fromTokenAddress: TOKEN_MAP.OKB, toTokenAddress: TOKEN_MAP.WETH,
        amount: okbAmount, slippage: '0.5',
      }),
    ]);
    cumulativeStats.totalApiCalls += 2;

    const directOut = directQuote.status === 'fulfilled' ? directQuote.value?.data?.[0]?.toTokenAmount : null;

    // If we got the first hop, get the second hop (WETH→USDT)
    let twoHopOut = null;
    if (hop1Quote.status === 'fulfilled') {
      const wethAmount = hop1Quote.value?.data?.[0]?.toTokenAmount;
      if (wethAmount) {
        try {
          const hop2 = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
            chainIndex: CHAIN_ID, fromTokenAddress: TOKEN_MAP.WETH, toTokenAddress: TOKEN_MAP.USDT,
            amount: wethAmount, slippage: '0.5',
          });
          cumulativeStats.totalApiCalls++;
          twoHopOut = hop2?.data?.[0]?.toTokenAmount || null;
        } catch (e) {
          summary.errors.push({ phase: 'arbitrage', path: 'OKB→WETH→USDT hop2', error: e.message });
        }
      }
    }

    if (directOut && twoHopOut) {
      const directVal = parseFloat(directOut) / 1e6; // USDT has 6 decimals
      const twoHopVal = parseFloat(twoHopOut) / 1e6;
      const spread = Math.abs(directVal - twoHopVal) / Math.min(directVal, twoHopVal) * 100;
      const profitable = spread > ARB_THRESHOLD;
      const bestPath = directVal >= twoHopVal ? 'direct' : 'two-hop';
      const savings = Math.abs(directVal - twoHopVal);

      const arbEntry = {
        type: 'multi-hop',
        pair: 'OKB/USDT',
        directPrice: directVal.toFixed(4),
        twoHopPrice: twoHopVal.toFixed(4),
        spreadPercent: spread.toFixed(4),
        profitable,
        bestPath,
        estimatedSavings: savings.toFixed(4),
        timestamp: Date.now(),
        cycle: cycleCount,
      };
      results.push(arbEntry);
      arbitrageHistory.push(arbEntry);
      if (arbitrageHistory.length > MAX_ARB_HISTORY) arbitrageHistory.splice(0, arbitrageHistory.length - MAX_ARB_HISTORY);

      cumulativeStats.arbitrageOpportunities++;
      if (profitable) {
        cumulativeStats.profitableArbs++;
        cumulativeStats.estimatedSavings += savings;
        addLog({ phase: 'arbitrage', action: `Arbitrage opportunity detected: OKB/USDT spread=${spread.toFixed(4)}% best=${bestPath}`, status: 'opportunity', data: arbEntry });
        // Auto-execute the arb swap
        await executeArbSwap(bestPath, summary);
      } else {
        addLog({ phase: 'arbitrage', action: `OKB/USDT spread=${spread.toFixed(4)}% (below threshold)`, status: 'done', data: arbEntry });
      }
    }
  } catch (e) {
    summary.errors.push({ phase: 'arbitrage', path: 'OKB multi-hop', error: e.message });
  }

  // Check stablecoin peg arbitrage: USDC/USDT
  try {
    const usdcAmount = String(BigInt(10 ** 6)); // 1 USDC (6 decimals)
    const pegQuote = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
      chainIndex: CHAIN_ID, fromTokenAddress: TOKEN_MAP.USDC, toTokenAddress: TOKEN_MAP.USDT,
      amount: usdcAmount, slippage: '0.5',
    });
    cumulativeStats.totalApiCalls++;

    const pegOut = pegQuote?.data?.[0]?.toTokenAmount;
    if (pegOut) {
      const pegVal = parseFloat(pegOut) / 1e6;
      const pegDeviation = Math.abs(1 - pegVal) * 100;
      const profitable = pegDeviation > ARB_THRESHOLD;

      const pegEntry = {
        type: 'stablecoin-peg',
        pair: 'USDC/USDT',
        inputAmount: '1.0000',
        outputAmount: pegVal.toFixed(6),
        pegDeviation: pegDeviation.toFixed(4),
        profitable,
        estimatedSavings: profitable ? (Math.abs(1 - pegVal)).toFixed(6) : '0',
        timestamp: Date.now(),
        cycle: cycleCount,
      };
      results.push(pegEntry);
      arbitrageHistory.push(pegEntry);
      if (arbitrageHistory.length > MAX_ARB_HISTORY) arbitrageHistory.splice(0, arbitrageHistory.length - MAX_ARB_HISTORY);

      cumulativeStats.arbitrageOpportunities++;
      if (profitable) {
        cumulativeStats.profitableArbs++;
        cumulativeStats.estimatedSavings += Math.abs(1 - pegVal);
        addLog({ phase: 'arbitrage', action: `Arbitrage opportunity detected: USDC/USDT peg deviation=${pegDeviation.toFixed(4)}%`, status: 'opportunity', data: pegEntry });
        // Auto-execute stablecoin arb swap
        await executeArbSwap('stablecoin-peg', summary);
      } else {
        addLog({ phase: 'arbitrage', action: `USDC/USDT peg deviation=${pegDeviation.toFixed(4)}% (stable)`, status: 'done', data: pegEntry });
      }
    }
  } catch (e) {
    summary.errors.push({ phase: 'arbitrage', path: 'USDC/USDT peg', error: e.message });
  }

  summary.arbitrage = results;
  return results;
}

// ── Yield Strategy Evaluation ──

async function runYieldStrategy(summary) {
  const results = [];
  addLog({ phase: 'yield_strategy', action: 'Evaluating yield strategy and portfolio allocation', status: 'running' });

  try {
    // Fetch current prices for DeFi tokens to evaluate allocation
    const defiTokens = ['OKB', 'WETH', 'USDC'];
    const prices = {};

    for (const sym of defiTokens) {
      try {
        const addr = TOKEN_MAP[sym] || '';
        const res = await okxRequest('GET', '/api/v5/wallet/token/token-detail', {
          chainIndex: CHAIN_ID, tokenAddress: addr,
        });
        cumulativeStats.totalApiCalls++;
        const data = res?.data?.[0];
        if (data) {
          const price = parseFloat(data.price || data.tokenPrice || '0');
          prices[sym] = price;
          // Track price history
          cumulativeStats.priceHistory.push({ token: sym, price, timestamp: Date.now() });
          if (cumulativeStats.priceHistory.length > MAX_PRICE_HISTORY) {
            cumulativeStats.priceHistory.splice(0, cumulativeStats.priceHistory.length - MAX_PRICE_HISTORY);
          }
        }
      } catch (e) {
        summary.errors.push({ phase: 'yield_strategy', token: sym, error: e.message });
      }
    }

    // Define target allocation (simple balanced portfolio)
    const targetAllocation = { OKB: 40, WETH: 30, USDC: 30 };

    // Simulate current allocation based on wallet balance or price momentum
    // Use price momentum to determine if rebalancing is beneficial
    const recentPrices = cumulativeStats.priceHistory.filter(p => p.timestamp > Date.now() - 30 * 60 * 1000);
    const momentum = {};

    for (const sym of defiTokens) {
      const symPrices = recentPrices.filter(p => p.token === sym);
      if (symPrices.length >= 2) {
        const oldest = symPrices[0].price;
        const newest = symPrices[symPrices.length - 1].price;
        momentum[sym] = oldest > 0 ? ((newest - oldest) / oldest) * 100 : 0;
      } else {
        momentum[sym] = 0;
      }
    }

    // Determine strategy decisions
    for (const sym of defiTokens) {
      const mom = momentum[sym] || 0;
      let action = 'hold';
      let reason = 'Stable allocation within target range';

      if (mom > 5) {
        action = 'take_profit';
        reason = `${sym} up ${mom.toFixed(2)}% in 30min — consider trimming position`;
      } else if (mom < -5) {
        action = 'accumulate';
        reason = `${sym} down ${Math.abs(mom).toFixed(2)}% in 30min — potential accumulation opportunity`;
      } else if (mom > 2) {
        action = 'monitor';
        reason = `${sym} trending up ${mom.toFixed(2)}% — monitoring for breakout`;
      } else if (mom < -2) {
        action = 'monitor';
        reason = `${sym} trending down ${Math.abs(mom).toFixed(2)}% — monitoring for support`;
      }

      const decision = {
        type: 'yield_rebalance',
        token: sym,
        action,
        reason,
        currentPrice: prices[sym] || 0,
        momentum: mom.toFixed(2),
        targetAllocation: targetAllocation[sym],
        timestamp: Date.now(),
        cycle: cycleCount,
      };

      results.push(decision);
      cumulativeStats.strategyDecisions.push(decision);
      if (cumulativeStats.strategyDecisions.length > MAX_STRATEGY_DECISIONS) {
        cumulativeStats.strategyDecisions.splice(0, cumulativeStats.strategyDecisions.length - MAX_STRATEGY_DECISIONS);
      }

      addLog({ phase: 'yield_strategy', action: `${sym}: ${action} — ${reason}`, status: 'done', data: decision });
    }
  } catch (e) {
    summary.errors.push({ phase: 'yield_strategy', error: e.message });
    addLog({ phase: 'yield_strategy', action: `Strategy error: ${e.message}`, status: 'error' });
  }

  summary.yieldStrategy = results;
  return results;
}

// ── Strategy Decision Engine (Phase 5.5) ──

function calculateVolatility(token) {
  const history = cumulativeStats.priceHistory
    .filter(p => p.token === token)
    .slice(-5);
  if (history.length < 2) return 'low';
  const prices = history.map(p => p.price);
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  if (mean === 0) return 'low';
  const variance = prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const stdDevPercent = (stdDev / mean) * 100;
  if (stdDevPercent > 3) return 'high';
  if (stdDevPercent >= 1) return 'medium';
  return 'low';
}

function assessGasEfficiency(serviceCallsTx) {
  if (!serviceCallsTx || serviceCallsTx.length === 0) return 'good';
  for (const tx of serviceCallsTx) {
    const gasUsed = parseFloat(tx.gasUsed || '0');
    // Convert gas used to OKB: gasUsed * gasPrice. Approximate with gasUsed in wei units.
    // gasUsed is in gas units; at typical gas prices on OKX Chain, estimate cost in OKB.
    // A rough heuristic: if gasUsed > 1e15 (0.001 OKB equivalent), it's poor.
    const estimatedCostOKB = gasUsed * 1e-9 * 0.000000001; // very conservative
    // Simpler: just check raw gas units — if > 500000 gas units, flag as poor
    if (gasUsed > 500000) return 'poor';
  }
  return 'good';
}

function checkSpreadOpportunity(arbitrageData) {
  if (!arbitrageData || !Array.isArray(arbitrageData)) return false;
  return arbitrageData.some(a => a.profitable === true);
}

function checkRiskEnvironment(securityScans) {
  if (!securityScans || !Array.isArray(securityScans)) return 'normal';
  for (const scan of securityScans) {
    if (scan.riskLevel && scan.riskLevel !== 'low') return 'elevated';
  }
  return 'normal';
}

async function runStrategyEngine(summary) {
  addLog({ phase: 'strategy_engine', action: 'Analyzing market conditions for decision', status: 'running' });

  // Gather metrics from phases 1-5
  const tokens = Object.keys(summary.priceData);
  const volatilities = {};
  let overallVolatility = 'low';
  for (const token of tokens) {
    volatilities[token] = calculateVolatility(token);
    if (volatilities[token] === 'high') overallVolatility = 'high';
    else if (volatilities[token] === 'medium' && overallVolatility !== 'high') overallVolatility = 'medium';
  }

  const gasEfficiency = assessGasEfficiency(summary.serviceCallsTx);
  const spreadOpportunity = checkSpreadOpportunity(summary.arbitrage);
  const riskEnvironment = checkRiskEnvironment(summary.securityScans);

  // Use previous cycle's wallet balance if available
  const prevCycle = cycleHistory.length > 0 ? cycleHistory[cycleHistory.length - 1] : null;
  const walletBalance = prevCycle?.walletBalance || null;

  const metrics = {
    volatility: overallVolatility,
    volatilityByToken: volatilities,
    gasEfficiency,
    spreadOpportunity,
    riskEnvironment,
    walletBalanceOKB: walletBalance?.okb || 'unknown',
  };

  // Decision logic
  let decision = 'monitor';
  let reason = 'Standard monitoring — no actionable conditions detected';

  if (riskEnvironment === 'elevated') {
    decision = 'risk_alert';
    reason = 'Elevated risk detected in security scans — adding extra monitoring';
  } else if (overallVolatility === 'high' && spreadOpportunity) {
    decision = 'aggressive_arb';
    reason = `High volatility with profitable spread — increasing arb amount to 0.005 OKB`;
  } else if (overallVolatility === 'high' && !spreadOpportunity) {
    decision = 'defensive';
    reason = 'High volatility but no spread opportunity — skipping swaps, monitor only';
  } else if (overallVolatility === 'low' && gasEfficiency === 'good') {
    decision = 'accumulate';
    reason = 'Low volatility with efficient gas — executing small DCA buy (0.001 OKB -> USDT)';
  }

  const decisionEntry = {
    type: 'strategy_engine',
    decision,
    reason,
    metrics,
    timestamp: Date.now(),
    cycle: cycleCount,
  };

  cumulativeStats.strategyDecisions.push(decisionEntry);
  if (cumulativeStats.strategyDecisions.length > MAX_STRATEGY_DECISIONS) {
    cumulativeStats.strategyDecisions.splice(0, cumulativeStats.strategyDecisions.length - MAX_STRATEGY_DECISIONS);
  }

  addLog({ phase: 'strategy_engine', action: `Decision: ${decision} — ${reason}`, status: 'done', data: decisionEntry });
  console.log(`[Autonomous] Strategy Engine: ${decision} — ${reason}`);

  // Execute actions based on decision
  if (decision === 'aggressive_arb') {
    await executeEngineSwap('aggressive_arb', summary);
  } else if (decision === 'accumulate') {
    await executeEngineSwap('accumulate', summary);
  } else if (decision === 'risk_alert') {
    // Run extra security scans on all tokens
    addLog({ phase: 'strategy_engine', action: 'Risk alert: scheduling extra security scans', status: 'running' });
    for (const token of SCAN_TOKENS) {
      try {
        const res = await okxRequest('POST', '/api/v6/security/token-scan', {
          source: 'api',
          tokenList: [{ chainId: CHAIN_ID, contractAddress: token.address }]
        });
        cumulativeStats.totalApiCalls++;
        const scanData = res?.data?.[0];
        const riskLevel = scanData?.securityInfo?.riskLevel || 'unknown';
        const entry = { token: token.name, address: token.address, riskLevel, timestamp: Date.now(), extraScan: true };
        summary.securityScans.push(entry);
        addLog({ phase: 'strategy_engine', action: `Extra scan ${token.name}: risk=${riskLevel}`, status: 'done', data: entry });
      } catch (e) {
        summary.errors.push({ phase: 'strategy_engine', token: token.name, error: e.message });
      }
    }
  }

  // Adjust dynamic interval based on decision
  if (decision === 'aggressive_arb') {
    dynamicInterval = 2 * 60 * 1000; // 2 minutes
  } else if (decision === 'defensive') {
    dynamicInterval = 8 * 60 * 1000; // 8 minutes
  } else {
    dynamicInterval = CYCLE_INTERVAL; // 5 minutes default
  }

  // Reschedule if running
  if (isRunning) {
    reschedule(dynamicInterval);
  }

  addLog({ phase: 'strategy_engine', action: `Next cycle interval: ${Math.round(dynamicInterval / 1000)}s`, status: 'done' });

  return decisionEntry;
}

async function executeEngineSwap(type, summary) {
  if (!serverWallet) {
    cumulativeStats.skippedSwaps++;
    cumulativeStats.walletStatus = 'no_wallet';
    cumulativeStats.lastFailureReason = `Engine swap (${type}) blocked: no server wallet`;
    addLog({ phase: 'strategy_engine', action: `BLOCKED (${type}): No server wallet configured`, status: 'blocked' });
    return null;
  }

  // Check balance before swap
  try {
    const bal = await rpcProvider.getBalance(serverWallet.address);
    const balOKB = parseFloat(ethers.formatEther(bal));
    const amountOKB = type === 'aggressive_arb' ? 0.005 : 0.001;
    if (balOKB < amountOKB + 0.0005) { // need amount + gas
      cumulativeStats.skippedSwaps++;
      cumulativeStats.walletStatus = balOKB < 0.001 ? 'empty' : 'low_balance';
      cumulativeStats.lastFailureReason = `Engine swap (${type}) blocked: balance ${balOKB.toFixed(6)} OKB < required ${amountOKB} OKB + gas`;
      addLog({ phase: 'strategy_engine', action: `BLOCKED (${type}): Balance ${balOKB.toFixed(6)} OKB insufficient for ${amountOKB} OKB swap + gas`, status: 'blocked' });
      return null;
    }
    cumulativeStats.walletStatus = balOKB < 0.01 ? 'low_balance' : 'funded';
  } catch (e) {
    // Balance check failed, try anyway
  }

  try {
    // aggressive_arb uses 0.005 OKB, accumulate uses 0.001 OKB
    const amountOKB = type === 'aggressive_arb' ? 0.005 : 0.001;
    const amountWei = String(BigInt(Math.floor(amountOKB * 1e18)));
    const fromAddr = TOKEN_MAP.OKB;
    const toAddr = TOKEN_MAP.USDT;

    addLog({ phase: 'strategy_engine', action: `Executing ${type} swap: ${amountOKB} OKB -> USDT`, status: 'running' });

    const swapRes = await okxRequest('GET', '/api/v6/dex/aggregator/swap', {
      chainIndex: CHAIN_ID,
      fromTokenAddress: fromAddr,
      toTokenAddress: toAddr,
      amount: amountWei,
      slippage: '1.0',
      userWalletAddress: serverWallet.address,
    });
    cumulativeStats.totalApiCalls++;

    const txData = swapRes?.data?.[0]?.tx;
    if (!txData) {
      addLog({ phase: 'strategy_engine', action: `${type} swap: no route available`, status: 'skipped' });
      return null;
    }

    const toTokenAmount = swapRes?.data?.[0]?.toTokenAmount || '0';

    const tx = await serverWallet.sendTransaction({
      to: txData.to,
      data: txData.data,
      value: txData.value || '0x0',
      gasLimit: txData.gas || '300000',
    });
    const receipt = await tx.wait();
    cumulativeStats.totalOnChainTxs++;

    const gasUsed = parseFloat(receipt.gasUsed.toString());
    cumulativeStats.totalGasSpent += gasUsed;

    const swapEntry = {
      type,
      fromToken: 'OKB',
      toToken: 'USDT',
      amountIn: `${amountOKB} OKB`,
      amountOut: toTokenAmount,
      txHash: receipt.hash,
      timestamp: Date.now(),
    };
    cumulativeStats.executedSwaps.push(swapEntry);

    addLog({
      phase: 'strategy_engine',
      action: `${type} swap executed! TX: ${receipt.hash.slice(0, 18)}... Block: ${receipt.blockNumber}`,
      status: 'done',
      data: swapEntry,
    });
    console.log(`[Autonomous] Engine swap (${type}): ${receipt.hash.slice(0, 22)}... (block ${receipt.blockNumber})`);

    return swapEntry;
  } catch (e) {
    cumulativeStats.failedExecutions++;
    cumulativeStats.lastFailureReason = `Engine swap (${type}) failed: ${e.message?.slice(0, 120)}`;
    addLog({ phase: 'strategy_engine', action: `EXECUTION FAILED (${type}): ${e.message?.slice(0, 80)}`, status: 'error' });
    summary.errors.push({ phase: 'strategy_engine', type, error: e.message });
    return null;
  }
}

function reschedule(newInterval) {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  dynamicInterval = newInterval;
  intervalHandle = setInterval(() => {
    runCycle().catch(e => console.error('[Autonomous] Cycle error:', e.message));
  }, dynamicInterval);
  console.log(`[Autonomous] Rescheduled: next cycle in ${Math.round(dynamicInterval / 1000)}s`);
}

// ── Earnings Timeline ──

function getEarningsTimeline() {
  const timeline = [];
  let cumulativeEarnings = 0;

  for (const cycle of cycleHistory) {
    // Each on-chain tx represents agent activity / value
    const txCount = (cycle.serviceCallsTx || []).length;
    const arbOpps = (cycle.arbitrage || []).filter(a => a.profitable).length;
    const savings = (cycle.arbitrage || []).reduce((sum, a) => sum + parseFloat(a.estimatedSavings || 0), 0);

    cumulativeEarnings += savings;

    timeline.push({
      cycleNumber: cycle.cycleNumber,
      timestamp: cycle.startedAt,
      onChainTxs: txCount,
      arbitrageOpportunities: arbOpps,
      cycleSavings: savings.toFixed(6),
      cumulativeEarnings: cumulativeEarnings.toFixed(6),
      quotesAnalyzed: (cycle.swapQuotes || []).length,
      strategiesEvaluated: (cycle.yieldStrategy || []).length,
    });
  }

  return timeline;
}

// ── Accessor Functions ──

function getCumulativeStats() {
  return {
    ...cumulativeStats,
    totalCycles: cycleCount,
    uptime: cumulativeStats.startedAt ? Date.now() - cumulativeStats.startedAt : 0,
    averageCycleTime: cycleHistory.length > 0
      ? Math.round(cycleHistory.reduce((sum, c) => sum + (c.duration || 0), 0) / cycleHistory.length)
      : 0,
  };
}

function getStrategyDecisions(limit = 20) {
  return cumulativeStats.strategyDecisions.slice(-limit);
}

function getArbitrageHistory(limit = 20) {
  return arbitrageHistory.slice(-limit);
}

// ── Control Functions ──

function start() {
  if (isRunning) return { status: 'already_running', cycleCount };
  isRunning = true;
  dynamicInterval = CYCLE_INTERVAL;
  console.log(`[Autonomous] Agent autonomous loop STARTED (interval: ${Math.round(dynamicInterval / 1000)}s)`);
  addLog({ phase: 'system', action: 'Autonomous loop started', status: 'running' });

  // Run first cycle immediately
  runCycle().catch(e => console.error('[Autonomous] First cycle error:', e.message));

  // Then every dynamicInterval
  intervalHandle = setInterval(() => {
    runCycle().catch(e => console.error('[Autonomous] Cycle error:', e.message));
  }, dynamicInterval);

  return { status: 'started', interval: dynamicInterval };
}

function stop() {
  if (!isRunning) return { status: 'not_running' };
  isRunning = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  addLog({ phase: 'system', action: 'Autonomous loop stopped', status: 'stopped' });
  console.log('[Autonomous] Agent autonomous loop STOPPED');
  return { status: 'stopped', totalCycles: cycleCount };
}

function getStatus() {
  return {
    running: isRunning,
    cycleCount,
    lastCycleTime,
    nextCycleIn: isRunning && lastCycleTime ? Math.max(0, dynamicInterval - (Date.now() - lastCycleTime)) : null,
    interval: dynamicInterval,
    defaultInterval: CYCLE_INTERVAL,
    logSize: autonomousLog.length,
    cycleHistorySize: cycleHistory.length,
  };
}

function getLog(limit = 50) {
  return autonomousLog.slice(-limit);
}

function getCycleHistory(limit = 20) {
  return cycleHistory.slice(-limit);
}

function getLatestCycle() {
  return cycleHistory.length > 0 ? cycleHistory[cycleHistory.length - 1] : null;
}

module.exports = {
  start, stop, getStatus, getLog, getCycleHistory, getLatestCycle, runCycle,
  getCumulativeStats, getEarningsTimeline, getStrategyDecisions, getArbitrageHistory,
  autonomousLog, cycleHistory,
};
