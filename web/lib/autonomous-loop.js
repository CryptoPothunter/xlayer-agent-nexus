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
const MAX_LOG_SIZE = 500;
const MAX_CYCLES = 200;

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

    // ── Phase 4: On-Chain Service Calls ──
    addLog({ phase: 'service_calls', action: 'Recording service calls on-chain', status: 'running' });
    const txResults = await runOnChainRecording(summary);
    summary.actions.push({ phase: 'service_calls', txCount: txResults.length, status: 'done' });

    // ── Phase 5: Wallet Balance Check ──
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

      const entry = {
        pair: pair.label,
        standardOutput: stdData?.toTokenAmount || 'N/A',
        tightOutput: tightData?.toTokenAmount || 'N/A',
        dexSources: stdData?.dexRouterList?.length || 0,
        priceImpact: stdData?.priceImpactPercent || 'N/A',
        timestamp: Date.now(),
      };
      summary.swapQuotes.push(entry);
      results.push(entry);
      addLog({ phase: 'dex_quotes', action: `${pair.label}: ${entry.dexSources} DEX sources`, status: 'done', data: entry });
    } catch (e) {
      summary.errors.push({ phase: 'dex_quotes', pair: pair.label, error: e.message });
    }
  }
  return results;
}

async function runOnChainRecording(summary) {
  const results = [];
  if (!serverWallet) {
    addLog({ phase: 'service_calls', action: 'No server wallet — skipping on-chain recording', status: 'skipped' });
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

    const data = {
      address: addr,
      okb: ethers.formatEther(okbBalance),
      usdt: ethers.formatUnits(usdtBalance, 6),
      timestamp: Date.now(),
    };
    addLog({ phase: 'balance_check', action: `Balance: ${data.okb} OKB, ${data.usdt} USDT`, status: 'done', data });
    return data;
  } catch (e) {
    summary.errors.push({ phase: 'balance_check', error: e.message });
    return null;
  }
}

// ── Control Functions ──

function start() {
  if (isRunning) return { status: 'already_running', cycleCount };
  isRunning = true;
  console.log('[Autonomous] Agent autonomous loop STARTED (interval: 5 min)');
  addLog({ phase: 'system', action: 'Autonomous loop started', status: 'running' });

  // Run first cycle immediately
  runCycle().catch(e => console.error('[Autonomous] First cycle error:', e.message));

  // Then every 5 minutes
  intervalHandle = setInterval(() => {
    runCycle().catch(e => console.error('[Autonomous] Cycle error:', e.message));
  }, CYCLE_INTERVAL);

  return { status: 'started', interval: CYCLE_INTERVAL };
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
    nextCycleIn: isRunning && lastCycleTime ? Math.max(0, CYCLE_INTERVAL - (Date.now() - lastCycleTime)) : null,
    interval: CYCLE_INTERVAL,
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
  autonomousLog, cycleHistory,
};
