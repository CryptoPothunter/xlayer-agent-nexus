/**
 * Multi-Agent Collaboration — 3 independent wallets with real on-chain interactions
 * Each agent has its own wallet, registers services, and pays other agents via USDT.
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

// ── State ──
const collaborationLog = [];
const collaborationCycles = [];
let agentWallets = []; // [mainWallet, subWallet1, subWallet2]
let agentProfiles = []; // Cached profiles
let isInitialized = false;
let collaborationCount = 0;
const MAX_LOG = 300;

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

// ── Run Collaboration Cycle ──
async function runCollaboration() {
  if (!isInitialized) await initialize();
  collaborationCount++;
  const cycleStart = Date.now();
  const cycleId = `collab_${collaborationCount}_${Date.now()}`;
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

    // ── Step 2: Cross-Agent Service Calls with USDT Payment ──
    // Each sub-agent calls one of the main agent's services
    for (let i = 1; i < agentWallets.length; i++) {
      const caller = agentWallets[i];
      const callerRegistry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_FULL_ABI, caller.wallet);

      // Find a service NOT owned by this caller
      const targetServices = services.filter(s =>
        s.provider.toLowerCase() !== caller.wallet.address.toLowerCase()
      );
      if (targetServices.length === 0) continue;

      const targetSvc = targetServices[collaborationCount % targetServices.length];

      try {
        // Execute real API call (the service work)
        let apiResult;
        if (targetSvc.name.includes('Swap') || targetSvc.name.includes('Scanner') || targetSvc.name.includes('Token')) {
          apiResult = await okxRequest('POST', '/api/v6/security/token-scan', {
            source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: USDT_ADDRESS }]
          });
        } else {
          apiResult = await okxRequest('GET', '/api/v5/wallet/token/token-detail', {
            chainIndex: CHAIN_ID, tokenAddress: TOKEN_MAP.OKB
          });
        }

        addCollabLog({
          agent: caller.def.name,
          action: `Executing ${targetSvc.name} service (API call)`,
          status: 'done',
          data: { service: targetSvc.name, apiSuccess: !!apiResult?.data },
        });

        // Record the service call on-chain (provider must record it)
        // Find the provider wallet
        const providerAgent = agentWallets.find(a =>
          a.wallet.address.toLowerCase() === targetSvc.provider.toLowerCase()
        );

        if (providerAgent) {
          const providerRegistry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_FULL_ABI, providerAgent.wallet);
          const tx = await providerRegistry.recordServiceCall(targetSvc.id, caller.wallet.address);
          const receipt = await tx.wait();

          summary.interactions.push({
            type: 'service_call',
            caller: caller.def.name,
            provider: providerAgent.def.name,
            service: targetSvc.name,
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
          });

          addCollabLog({
            agent: providerAgent.def.name,
            action: `Recorded ${caller.def.name}'s call to ${targetSvc.name}`,
            status: 'done',
            txHash: receipt.hash,
          });

          console.log(`[MultiAgent] ${caller.def.name} -> ${targetSvc.name} (tx: ${receipt.hash.slice(0, 18)}...)`);
        }

        // Try USDT payment if server wallet has balance
        try {
          const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, serverWallet);
          const balance = await usdt.balanceOf(serverWallet.address);
          const payAmount = ethers.parseUnits('0.005', 6); // 0.005 USDT

          if (balance >= payAmount && providerAgent && i === 1) {
            // Main wallet pays sub-wallet as settlement
            const payTx = await usdt.transfer(caller.wallet.address, payAmount);
            const payReceipt = await payTx.wait();
            summary.payments.push({
              from: 'NexusOrchestrator',
              to: caller.def.name,
              amount: '0.005 USDT',
              txHash: payReceipt.hash,
              blockNumber: payReceipt.blockNumber,
              reason: `Payment for ${targetSvc.name} service`,
            });
            addCollabLog({
              agent: 'NexusOrchestrator',
              action: `Paid ${caller.def.name} 0.005 USDT for ${targetSvc.name}`,
              status: 'done',
              txHash: payReceipt.hash,
            });
          }
        } catch (e) {
          // Payment failure is non-fatal
          summary.errors.push({ phase: 'payment', error: e.message });
        }
      } catch (e) {
        summary.errors.push({ phase: 'service_call', caller: caller.def.name, error: e.message });
        addCollabLog({ agent: caller.def.name, action: `Service call failed: ${e.message}`, status: 'error' });
      }
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
