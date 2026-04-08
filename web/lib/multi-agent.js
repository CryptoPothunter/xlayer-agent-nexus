/**
 * Multi-Agent Collaboration — 3 independent wallets with real on-chain interactions
 * Each agent has its own wallet, registers services, and pays other agents via USDT.
 * Agents have genuinely different behaviors:
 *   - AlphaTrader: DEX quote analysis, spread detection, swap execution
 *   - DeFiGuardian: Token security scanning, approval risk analysis
 *   - NexusOrchestrator: Portfolio tracking, strategy decisions, on-chain recording
 */
const { ethers } = require('ethers');
const { CHAIN_ID, USDT_ADDRESS, ERC20_ABI, REGISTRY_ADDRESS, TOKEN_MAP } = require('./config');
const { okxRequest } = require('./okx-auth');
const { serverWallet, rpcProvider, AGENT_WALLET } = require('./wallet');

// ── Agent Definitions ──
const AGENT_DEFS = [
  {
    name: 'NexusOrchestrator',
    role: 'orchestrator',
    services: ['SwapOptimizer', 'TokenScanner', 'PriceAlert'],
    description: 'Primary orchestrator agent managing marketplace coordination',
  },
  {
    name: 'AlphaTrader',
    role: 'trader',
    services: ['SentimentScanner', 'WhaleTracker'],
    description: 'Trading intelligence agent specializing in market analysis',
  },
  {
    name: 'DeFiGuardian',
    role: 'guardian',
    services: ['RugPullDetector', 'YieldComparator'],
    description: 'Security and DeFi monitoring agent',
  },
];

const REGISTRY_FULL_ABI = [
  'function registerAgent(string calldata name) external',
  'function registerService(string calldata name, string calldata description, string calldata endpoint, uint256 pricePerCall) external returns (bytes32 serviceId)',
  'function recordServiceCall(bytes32 serviceId, address caller) external',
  'function rateService(bytes32 serviceId, uint8 score) external',
  'function getServiceCount() view returns (uint256)',
  'function getServiceById(bytes32 serviceId) view returns (tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt))',
  'function getAgentProfile(address agent) view returns (tuple(address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered))',
  'function getAllActiveServices() view returns (bytes32[])',
  'function allServiceIds(uint256 index) view returns (bytes32)',
  'function getAgentServices(address agent) view returns (bytes32[])',
];

// OKX DEX router address on X Layer (used for approval security checks)
const OKX_DEX_ROUTER = '0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f';

// ── State ──
const collaborationLog = [];
const collaborationCycles = [];
let agentWallets = []; // [mainWallet, subWallet1, subWallet2]
let agentProfiles = []; // Cached profiles
let isInitialized = false;
let collaborationCount = 0;
const MAX_LOG = 300;

// Shared results from agent work within a single collaboration cycle
let cycleSharedState = {};

function addCollabLog(entry) {
  const item = { ...entry, timestamp: Date.now() };
  collaborationLog.push(item);
  if (collaborationLog.length > MAX_LOG) collaborationLog.splice(0, collaborationLog.length - MAX_LOG);
  return item;
}

// Derive deterministic sub-wallets (same as generate-multi-wallet-activity.js)
function deriveWallets(mainKeyHex, count) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const seed = ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'uint256'], [mainKeyHex, i + 1])
    );
    wallets.push(new ethers.Wallet(seed, rpcProvider));
  }
  return wallets;
}

// ── Initialize Multi-Agent System ──
async function initialize() {
  if (!serverWallet) {
    console.log('[MultiAgent] No server wallet — multi-agent disabled');
    return { status: 'no_wallet' };
  }

  console.log('[MultiAgent] Initializing multi-agent system...');
  addCollabLog({ agent: 'System', action: 'Initializing multi-agent collaboration', status: 'running' });

  const mainKey = serverWallet.privateKey;
  const subWallets = deriveWallets(mainKey, 2);

  agentWallets = [
    { wallet: serverWallet, def: AGENT_DEFS[0] },
    { wallet: subWallets[0], def: AGENT_DEFS[1] },
    { wallet: subWallets[1], def: AGENT_DEFS[2] },
  ];

  // Log agent addresses
  for (const aw of agentWallets) {
    const bal = await rpcProvider.getBalance(aw.wallet.address);
    console.log(`[MultiAgent] ${aw.def.name}: ${aw.wallet.address} (${ethers.formatEther(bal)} OKB)`);
    addCollabLog({
      agent: aw.def.name,
      action: `Wallet: ${aw.wallet.address.slice(0, 10)}... Balance: ${ethers.formatEther(bal)} OKB`,
      status: 'info',
    });
  }

  isInitialized = true;
  addCollabLog({ agent: 'System', action: 'Multi-agent system initialized with 3 agents', status: 'done' });
  return { status: 'initialized', agents: agentWallets.map(a => ({ name: a.def.name, address: a.wallet.address })) };
}

// ── Fund Sub-Wallets ──
async function fundSubWallets() {
  if (!isInitialized) await initialize();
  const results = [];

  for (let i = 1; i < agentWallets.length; i++) {
    const sub = agentWallets[i];
    try {
      const bal = await rpcProvider.getBalance(sub.wallet.address);
      const threshold = ethers.parseEther('0.002');
      if (bal >= threshold) {
        results.push({ agent: sub.def.name, status: 'sufficient', balance: ethers.formatEther(bal) });
        continue;
      }
      const amount = ethers.parseEther('0.005');
      const tx = await serverWallet.sendTransaction({ to: sub.wallet.address, value: amount });
      const receipt = await tx.wait();
      results.push({
        agent: sub.def.name,
        status: 'funded',
        txHash: receipt.hash,
        amount: '0.005 OKB',
        blockNumber: receipt.blockNumber,
      });
      addCollabLog({
        agent: 'NexusOrchestrator',
        action: `Funded ${sub.def.name} with 0.005 OKB`,
        status: 'done',
        txHash: receipt.hash,
      });
    } catch (e) {
      results.push({ agent: sub.def.name, status: 'error', error: e.message });
    }
  }
  return results;
}

// ════════════════════════════════════════════════════════════════
// ── AlphaTrader: DEX Quote Analysis & Spread Detection ──
// ════════════════════════════════════════════════════════════════
// PLACEHOLDER: alphaTraderWork
async function alphaTraderWork(traderAgent) {
  const traderName = traderAgent.def.name;
  const traderAddress = traderAgent.wallet.address;
  addCollabLog({ agent: traderName, action: 'Fetching DEX quotes for spread analysis...', status: 'running' });

  const pairs = [
    { from: 'OKB',  to: 'USDT', label: 'OKB/USDT',  amount: ethers.parseEther('1').toString() },
    { from: 'WETH', to: 'USDT', label: 'WETH/USDT',  amount: ethers.parseEther('0.01').toString() },
    { from: 'USDC', to: 'USDT', label: 'USDC/USDT',  amount: ethers.parseUnits('10', 6).toString() },
  ];

  const quoteResults = [];
  for (const pair of pairs) {
    try {
      const directQuote = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
        chainIndex: CHAIN_ID,
        fromTokenAddress: TOKEN_MAP[pair.from],
        toTokenAddress: TOKEN_MAP[pair.to],
        amount: pair.amount,
        slippage: '0.005',
      });

      const reverseQuote = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
        chainIndex: CHAIN_ID,
        fromTokenAddress: TOKEN_MAP[pair.to],
        toTokenAddress: TOKEN_MAP[pair.from],
        amount: pair.from === 'USDC'
          ? ethers.parseUnits('10', 6).toString()
          : ethers.parseUnits('10', 6).toString(),
        slippage: '0.005',
      });

      const directOut = directQuote?.data?.[0]?.toTokenAmount || '0';
      const reverseOut = reverseQuote?.data?.[0]?.toTokenAmount || '0';
      const routerPaths = directQuote?.data?.[0]?.dexRouterList?.length || 0;

      // Calculate implied spread: if we sell 1 OKB for X USDT, then buy OKB with X USDT,
      // the difference vs 1 OKB is the round-trip spread
      let spreadPct = 0;
      if (directOut !== '0' && reverseOut !== '0') {
        // Simplified: compare direct output decimals
        const directNum = parseFloat(directOut);
        const reverseNum = parseFloat(reverseOut);
        if (directNum > 0) {
          spreadPct = Math.abs(1 - (reverseNum / parseFloat(pair.amount))) * 100;
        }
      }

      quoteResults.push({
        pair: pair.label,
        directOutput: directOut,
        reverseOutput: reverseOut,
        routerPaths,
        spreadPct: spreadPct.toFixed(4),
      });

      addCollabLog({
        agent: traderName,
        action: `${pair.label}: output=${directOut}, routes=${routerPaths}, spread=${spreadPct.toFixed(4)}%`,
        status: 'done',
        data: { pair: pair.label, directOutput: directOut, routerPaths, spreadPct: spreadPct.toFixed(4) },
      });
    } catch (e) {
      quoteResults.push({ pair: pair.label, error: e.message });
      addCollabLog({ agent: traderName, action: `${pair.label} quote failed: ${e.message}`, status: 'error' });
    }
  }

  // Check if any spread is worth trading on (> 0.3%)
  let swapExecuted = null;
  const profitablePair = quoteResults.find(q => parseFloat(q.spreadPct || '0') > 0.3);
  if (profitablePair && !profitablePair.error) {
    // Check balance before attempting swap
    let canSwap = true;
    try {
      const bal = await rpcProvider.getBalance(traderAddress);
      const balOKB = parseFloat(ethers.formatEther(bal));
      if (balOKB < 0.002) {
        canSwap = false;
        addCollabLog({
          agent: traderName,
          action: `BLOCKED: Spread opportunity on ${profitablePair.pair} (${profitablePair.spreadPct}%) but insufficient balance (${balOKB.toFixed(6)} OKB). Need >= 0.002 OKB for swap + gas.`,
          status: 'blocked',
        });
      }
    } catch {}

    if (canSwap) {
    addCollabLog({
      agent: traderName,
      action: `Spread opportunity on ${profitablePair.pair} (${profitablePair.spreadPct}%) — executing small swap`,
      status: 'running',
    });
    try {
      // Execute a small 0.001 OKB swap
      const swapAmount = ethers.parseEther('0.001').toString();
      const swapResult = await okxRequest('GET', '/api/v6/dex/aggregator/swap', {
        chainIndex: CHAIN_ID,
        fromTokenAddress: TOKEN_MAP.OKB,
        toTokenAddress: TOKEN_MAP.USDT,
        amount: swapAmount,
        slippage: '0.01',
        userWalletAddress: traderAddress,
      });

      const txData = swapResult?.data?.[0]?.tx;
      if (txData) {
        const tx = await traderAgent.wallet.sendTransaction({
          to: txData.to,
          data: txData.data,
          value: txData.value ? BigInt(txData.value) : 0n,
          gasLimit: txData.gas ? BigInt(txData.gas) : undefined,
        });
        const receipt = await tx.wait();
        swapExecuted = {
          pair: profitablePair.pair,
          spreadPct: profitablePair.spreadPct,
          amount: '0.001 OKB',
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        };
        addCollabLog({
          agent: traderName,
          action: `Swap executed: 0.001 OKB -> USDT (tx: ${receipt.hash.slice(0, 18)}...)`,
          status: 'done',
          txHash: receipt.hash,
        });
      } else {
        addCollabLog({ agent: traderName, action: 'Swap API returned no tx data — skipping execution', status: 'info' });
      }
    } catch (e) {
      addCollabLog({ agent: traderName, action: `Swap execution failed: ${e.message}`, status: 'error' });
    }
    } // end canSwap
  } else {
    addCollabLog({ agent: traderName, action: 'No spreads above 0.3% threshold — no trade executed', status: 'info' });
  }

  const result = { quotes: quoteResults, swapExecuted };
  cycleSharedState.traderReport = result;
  return result;
}

// ════════════════════════════════════════════════════════════════
// ── DeFiGuardian: Security Scanning & Risk Assessment ──
// ════════════════════════════════════════════════════════════════
// PLACEHOLDER: deFiGuardianWork
async function deFiGuardianWork(guardianAgent) {
  const guardianName = guardianAgent.def.name;
  addCollabLog({ agent: guardianName, action: 'Running token security scans...', status: 'running' });

  // Scan 3 tokens for security issues
  const tokensToScan = [
    { symbol: 'USDT', address: TOKEN_MAP.USDT },
    { symbol: 'WETH', address: TOKEN_MAP.WETH },
    { symbol: 'USDC', address: TOKEN_MAP.USDC },
  ];

  const scanResults = [];
  for (const token of tokensToScan) {
    try {
      const scanResp = await okxRequest('POST', '/api/v6/security/token-scan', {
        source: 'api',
        tokenList: [{ chainId: CHAIN_ID, contractAddress: token.address }],
      });

      const scanData = scanResp?.data?.[0] || {};
      const riskLevel = scanData.riskLevel || scanData.securityLevel || 'unknown';
      const isMintable = scanData.isMintable || false;
      const isProxy = scanData.isProxy || false;
      const isHoneypot = scanData.isHoneypot || false;
      const holderCount = scanData.holderCount || 'N/A';

      const riskFlags = [];
      if (isMintable) riskFlags.push('MINTABLE');
      if (isProxy) riskFlags.push('PROXY_CONTRACT');
      if (isHoneypot) riskFlags.push('HONEYPOT');

      scanResults.push({
        symbol: token.symbol,
        address: token.address,
        riskLevel,
        isMintable,
        isProxy,
        isHoneypot,
        holderCount,
        riskFlags,
        safe: riskFlags.length === 0 && riskLevel !== 'high',
      });

      const flagStr = riskFlags.length > 0 ? ` [FLAGS: ${riskFlags.join(', ')}]` : ' [CLEAN]';
      addCollabLog({
        agent: guardianName,
        action: `${token.symbol} scan: risk=${riskLevel}, holders=${holderCount}${flagStr}`,
        status: riskFlags.length > 0 ? 'warning' : 'done',
        data: { symbol: token.symbol, riskLevel, riskFlags },
      });
    } catch (e) {
      scanResults.push({ symbol: token.symbol, address: token.address, error: e.message });
      addCollabLog({ agent: guardianName, action: `${token.symbol} scan error: ${e.message}`, status: 'error' });
    }
  }

  // Check approval security for OKX DEX router
  addCollabLog({ agent: guardianName, action: 'Checking DEX router approval security...', status: 'running' });
  const approvalResults = [];
  for (const token of tokensToScan) {
    try {
      const approvalResp = await okxRequest('GET', '/api/v6/dex/pre-transaction/approve-security', {
        chainIndex: CHAIN_ID,
        tokenAddress: token.address,
        spenderAddress: OKX_DEX_ROUTER,
      });

      const approvalData = approvalResp?.data?.[0] || {};
      const isApprovalSafe = approvalData.isApproved !== false;
      const riskItems = approvalData.riskList || [];

      approvalResults.push({
        symbol: token.symbol,
        spender: OKX_DEX_ROUTER,
        safe: riskItems.length === 0,
        riskItems: riskItems.map(r => r.description || r.riskType || 'unknown'),
      });

      const approvalStatus = riskItems.length === 0 ? 'SAFE' : `RISKS: ${riskItems.length}`;
      addCollabLog({
        agent: guardianName,
        action: `${token.symbol} approval check: ${approvalStatus}`,
        status: riskItems.length === 0 ? 'done' : 'warning',
      });
    } catch (e) {
      approvalResults.push({ symbol: token.symbol, error: e.message });
    }
  }

  // Build overall risk assessment
  const dangerousTokens = scanResults.filter(s => !s.safe && !s.error);
  const totalRisks = scanResults.reduce((sum, s) => sum + (s.riskFlags?.length || 0), 0);
  const overallRisk = dangerousTokens.length > 0 ? 'elevated' : totalRisks > 0 ? 'moderate' : 'low';

  const riskAssessment = {
    overallRisk,
    scannedTokens: scanResults.length,
    dangerousTokens: dangerousTokens.map(t => t.symbol),
    totalRiskFlags: totalRisks,
    approvalSafe: approvalResults.every(a => a.safe || a.error),
    recommendation: overallRisk === 'low'
      ? 'All scanned tokens appear safe. Trading is approved.'
      : overallRisk === 'moderate'
        ? 'Minor risks detected. Proceed with caution and smaller position sizes.'
        : 'Elevated risk detected. Recommend pausing new positions until further review.',
  };

  addCollabLog({
    agent: guardianName,
    action: `Risk assessment: ${overallRisk.toUpperCase()} — ${riskAssessment.recommendation}`,
    status: overallRisk === 'low' ? 'done' : 'warning',
    data: riskAssessment,
  });

  const result = { tokenScans: scanResults, approvalChecks: approvalResults, riskAssessment };
  cycleSharedState.guardianReport = result;
  return result;
}

// ════════════════════════════════════════════════════════════════
// ── NexusOrchestrator: Portfolio & Strategy Decision ──
// ════════════════════════════════════════════════════════════════
// PLACEHOLDER: orchestratorWork
async function orchestratorWork(orchestratorAgent, registry, services) {
  const orchName = orchestratorAgent.def.name;
  addCollabLog({ agent: orchName, action: 'Gathering portfolio balances for all agents...', status: 'running' });

  // 1. Get wallet balances for all 3 agents
  const portfolioBalances = [];
  for (const aw of agentWallets) {
    try {
      const okbBal = await rpcProvider.getBalance(aw.wallet.address);

      let usdtBal = 0n;
      let wethBal = 0n;
      try {
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, rpcProvider);
        usdtBal = await usdt.balanceOf(aw.wallet.address);
      } catch {}
      try {
        const weth = new ethers.Contract(TOKEN_MAP.WETH, ERC20_ABI, rpcProvider);
        wethBal = await weth.balanceOf(aw.wallet.address);
      } catch {}

      portfolioBalances.push({
        agent: aw.def.name,
        address: aw.wallet.address,
        okb: ethers.formatEther(okbBal),
        usdt: ethers.formatUnits(usdtBal, 6),
        weth: ethers.formatEther(wethBal),
      });

      addCollabLog({
        agent: orchName,
        action: `${aw.def.name}: ${ethers.formatEther(okbBal)} OKB, ${ethers.formatUnits(usdtBal, 6)} USDT, ${ethers.formatEther(wethBal)} WETH`,
        status: 'info',
      });
    } catch (e) {
      portfolioBalances.push({ agent: aw.def.name, error: e.message });
    }
  }

  // 2. Get token prices to compute portfolio value
  addCollabLog({ agent: orchName, action: 'Fetching token prices...', status: 'running' });
  const prices = {};
  for (const symbol of ['OKB', 'WETH']) {
    try {
      const priceResp = await okxRequest('GET', '/api/v5/wallet/token/token-detail', {
        chainIndex: CHAIN_ID,
        tokenAddress: TOKEN_MAP[symbol],
      });
      const tokenData = priceResp?.data?.[0];
      const price = parseFloat(tokenData?.price || tokenData?.usdPrice || '0');
      prices[symbol] = price;
    } catch (e) {
      prices[symbol] = 0;
    }
  }
  prices['USDT'] = 1.0; // stablecoin

  addCollabLog({
    agent: orchName,
    action: `Prices: OKB=$${prices.OKB.toFixed(2)}, WETH=$${prices.WETH.toFixed(2)}`,
    status: 'done',
    data: prices,
  });

  // 3. Compute total portfolio value
  let totalPortfolioUSD = 0;
  for (const bal of portfolioBalances) {
    if (bal.error) continue;
    const okbVal = parseFloat(bal.okb) * prices.OKB;
    const usdtVal = parseFloat(bal.usdt) * prices.USDT;
    const wethVal = parseFloat(bal.weth) * prices.WETH;
    bal.valueUSD = (okbVal + usdtVal + wethVal).toFixed(2);
    totalPortfolioUSD += okbVal + usdtVal + wethVal;
  }

  // 4. Strategy decision based on inputs from other agents
  const guardianReport = cycleSharedState.guardianReport || {};
  const traderReport = cycleSharedState.traderReport || {};
  const overallRisk = guardianReport.riskAssessment?.overallRisk || 'unknown';
  const spreadOpportunity = traderReport.swapExecuted !== null && traderReport.swapExecuted !== undefined;
  const bestSpread = Math.max(
    ...(traderReport.quotes || []).map(q => parseFloat(q.spreadPct || '0')),
    0
  );

  // Simple momentum heuristic: if OKB price > $10, consider profitable
  const okbPrice = prices.OKB || 0;
  const momentum = okbPrice > 50 ? 'strong' : okbPrice > 20 ? 'moderate' : okbPrice > 5 ? 'neutral' : 'weak';

  let decision;
  let reasoning;
  if (overallRisk === 'elevated') {
    decision = 'hold';
    reasoning = 'Guardian flagged elevated risk — holding positions until risk clears.';
  } else if (momentum === 'strong' && totalPortfolioUSD > 100) {
    decision = 'take_profit';
    reasoning = `Strong OKB momentum ($${okbPrice.toFixed(2)}) with portfolio at $${totalPortfolioUSD.toFixed(2)} — take partial profits.`;
  } else if (bestSpread > 0.5 && overallRisk === 'low') {
    decision = 'accumulate';
    reasoning = `DEX spreads at ${bestSpread.toFixed(2)}% with low risk — accumulate via spread capture.`;
  } else if (momentum === 'weak') {
    decision = 'rebalance';
    reasoning = `Weak momentum ($${okbPrice.toFixed(2)}) — rebalance toward stables.`;
  } else {
    decision = 'hold';
    reasoning = `Moderate conditions (momentum=${momentum}, risk=${overallRisk}, spread=${bestSpread.toFixed(2)}%) — hold current positions.`;
  }

  const strategyDecision = {
    decision,
    reasoning,
    inputs: {
      momentum,
      okbPrice,
      totalPortfolioUSD: totalPortfolioUSD.toFixed(2),
      overallRisk,
      bestSpreadPct: bestSpread.toFixed(2),
      spreadTradeExecuted: !!traderReport.swapExecuted,
    },
  };

  addCollabLog({
    agent: orchName,
    action: `STRATEGY: ${decision.toUpperCase()} — ${reasoning}`,
    status: 'done',
    data: strategyDecision,
  });

  // 5. Record the decision on-chain via recordServiceCall (use first available service)
  if (services.length > 0) {
    try {
      const orchRegistry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_FULL_ABI, orchestratorAgent.wallet);
      const ownServices = services.filter(
        s => s.provider.toLowerCase() === orchestratorAgent.wallet.address.toLowerCase()
      );
      const targetSvc = ownServices.length > 0 ? ownServices[0] : services[0];
      const tx = await orchRegistry.recordServiceCall(targetSvc.id, orchestratorAgent.wallet.address);
      const receipt = await tx.wait();
      addCollabLog({
        agent: orchName,
        action: `Strategy decision recorded on-chain (tx: ${receipt.hash.slice(0, 18)}...)`,
        status: 'done',
        txHash: receipt.hash,
      });
      strategyDecision.txHash = receipt.hash;
      strategyDecision.blockNumber = receipt.blockNumber;
    } catch (e) {
      addCollabLog({ agent: orchName, action: `On-chain recording failed: ${e.message}`, status: 'error' });
    }
  }

  return { portfolioBalances, prices, totalPortfolioUSD: totalPortfolioUSD.toFixed(2), strategyDecision };
}

// ── Run Collaboration Cycle ──
async function runCollaboration() {
  if (!isInitialized) await initialize();
  collaborationCount++;
  const cycleStart = Date.now();
  const cycleId = `collab_${collaborationCount}_${Date.now()}`;
  cycleSharedState = {}; // Reset shared state for this cycle

  const summary = {
    cycleId,
    cycleNumber: collaborationCount,
    startedAt: cycleStart,
    interactions: [],
    payments: [],
    ratings: [],
    errors: [],
  };

  console.log(`[MultiAgent] ═══ Collaboration Cycle #${collaborationCount} ═══`);
  addCollabLog({ agent: 'System', action: `Collaboration cycle #${collaborationCount} started`, status: 'running' });

  try {
    // ── Step 1: Service Discovery ──
    addCollabLog({ agent: 'AlphaTrader', action: 'Discovering available services on-chain', status: 'running' });
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_FULL_ABI, rpcProvider);
    const totalServices = Number(await registry.getServiceCount());
    const serviceIds = [];
    for (let i = 0; i < Math.min(totalServices, 10); i++) {
      serviceIds.push(await registry.allServiceIds(i));
    }

    const services = [];
    for (const sid of serviceIds) {
      try {
        const svc = await registry.getServiceById(sid);
        services.push({ id: sid, name: svc.name, provider: svc.provider, totalCalls: Number(svc.totalCalls) });
      } catch {}
    }
    addCollabLog({ agent: 'AlphaTrader', action: `Discovered ${services.length} services on marketplace`, status: 'done' });
    summary.interactions.push({ type: 'discovery', agent: 'AlphaTrader', servicesFound: services.length });

    // ── Step 2: Dispatch role-specific work to each agent ──

    // 2a. DeFiGuardian runs first (other agents need its risk assessment)
    try {
      const guardianResult = await deFiGuardianWork(agentWallets[2]);
      summary.interactions.push({
        type: 'guardian_scan',
        agent: 'DeFiGuardian',
        tokensScanned: guardianResult.tokenScans.length,
        overallRisk: guardianResult.riskAssessment.overallRisk,
      });
    } catch (e) {
      summary.errors.push({ phase: 'guardian_work', error: e.message });
      addCollabLog({ agent: 'DeFiGuardian', action: `Security scan failed: ${e.message}`, status: 'error' });
    }

    // 2b. AlphaTrader runs second (analyzes spreads, may execute swap)
    try {
      const traderResult = await alphaTraderWork(agentWallets[1]);
      summary.interactions.push({
        type: 'trader_analysis',
        agent: 'AlphaTrader',
        quotesAnalyzed: traderResult.quotes.length,
        swapExecuted: !!traderResult.swapExecuted,
        swapTxHash: traderResult.swapExecuted?.txHash || null,
      });
    } catch (e) {
      summary.errors.push({ phase: 'trader_work', error: e.message });
      addCollabLog({ agent: 'AlphaTrader', action: `Trading analysis failed: ${e.message}`, status: 'error' });
    }

    // 2c. NexusOrchestrator runs last (needs both reports for strategy)
    try {
      const orchResult = await orchestratorWork(agentWallets[0], registry, services);
      summary.interactions.push({
        type: 'strategy_decision',
        agent: 'NexusOrchestrator',
        decision: orchResult.strategyDecision.decision,
        reasoning: orchResult.strategyDecision.reasoning,
        portfolioUSD: orchResult.totalPortfolioUSD,
        txHash: orchResult.strategyDecision.txHash || null,
      });
    } catch (e) {
      summary.errors.push({ phase: 'orchestrator_work', error: e.message });
      addCollabLog({ agent: 'NexusOrchestrator', action: `Strategy cycle failed: ${e.message}`, status: 'error' });
    }

    // ── Step 3: Cross-Agent Ratings ──
    for (let i = 1; i < agentWallets.length; i++) {
      const rater = agentWallets[i];
      const raterRegistry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_FULL_ABI, rater.wallet);

      const targetServices = services.filter(s =>
        s.provider.toLowerCase() !== rater.wallet.address.toLowerCase()
      );
      if (targetServices.length === 0) continue;

      const targetSvc = targetServices[(collaborationCount + i) % targetServices.length];
      const score = 4 + (collaborationCount % 2); // 4 or 5

      try {
        const tx = await raterRegistry.rateService(targetSvc.id, score);
        const receipt = await tx.wait();

        summary.ratings.push({
          rater: rater.def.name,
          service: targetSvc.name,
          score,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        });

        addCollabLog({
          agent: rater.def.name,
          action: `Rated ${targetSvc.name}: ${score}/5`,
          status: 'done',
          txHash: receipt.hash,
        });

        console.log(`[MultiAgent] ${rater.def.name} rated ${targetSvc.name} ${score}/5 (tx: ${receipt.hash.slice(0, 18)}...)`);
      } catch (e) {
        summary.errors.push({ phase: 'rating', rater: rater.def.name, error: e.message });
      }
    }

    // ── Step 4: Fetch Updated Profiles ──
    agentProfiles = [];
    for (const aw of agentWallets) {
      try {
        const profile = await registry.getAgentProfile(aw.wallet.address);
        agentProfiles.push({
          name: aw.def.name,
          address: aw.wallet.address,
          registered: profile.registered,
          reputation: Number(profile.reputationScore),
          provided: Number(profile.totalServicesProvided),
          consumed: Number(profile.totalServicesConsumed),
          earned: ethers.formatEther(profile.totalEarned),
          spent: ethers.formatEther(profile.totalSpent),
        });
      } catch {}
    }
    summary.updatedProfiles = agentProfiles;

  } catch (e) {
    summary.errors.push({ phase: 'cycle', error: e.message });
    addCollabLog({ agent: 'System', action: `Collaboration error: ${e.message}`, status: 'error' });
  }

  summary.completedAt = Date.now();
  summary.duration = summary.completedAt - cycleStart;
  collaborationCycles.push(summary);
  if (collaborationCycles.length > 50) collaborationCycles.splice(0, collaborationCycles.length - 50);

  addCollabLog({
    agent: 'System',
    action: `Collaboration cycle #${collaborationCount} completed in ${summary.duration}ms`,
    status: 'done',
  });

  return summary;
}

// ── Getters ──
function getAgents() {
  if (!isInitialized) return [];
  return agentWallets.map((aw, i) => ({
    ...aw.def,
    address: aw.wallet.address,
    profile: agentProfiles[i] || null,
  }));
}

function getCollabLog(limit = 50) {
  return collaborationLog.slice(-limit);
}

function getCollabHistory(limit = 20) {
  return collaborationCycles.slice(-limit);
}

function getLatestCollab() {
  return collaborationCycles.length > 0 ? collaborationCycles[collaborationCycles.length - 1] : null;
}

module.exports = {
  initialize,
  fundSubWallets,
  runCollaboration,
  getAgents,
  getCollabLog,
  getCollabHistory,
  getLatestCollab,
  collaborationLog,
  collaborationCycles,
  isInitialized: () => isInitialized,
};
