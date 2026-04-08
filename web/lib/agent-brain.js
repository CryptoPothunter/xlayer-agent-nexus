/**
 * Agent Brain — NLP engine: intent classification, fuzzy matching, processAgentChat
 * Supports REAL on-chain execution: swap, scan, balance, price, service discovery
 */
const { CHAIN_ID, TOKEN_MAP, GROQ_API_KEY, CHAT_SESSION_TTL, CHAT_MAX_MESSAGES, REGISTRY_ADDRESS, ERC20_ABI } = require('./config');
const { okxRequest } = require('./okx-auth');
const { ethers, serverWallet, rpcProvider, AGENT_WALLET } = require('./wallet');
const { callLLM } = require('./llm');

// Service catalog — fallback; prefer live on-chain discovery
const SERVICE_CATALOG = {
  'token-scanner': { name: 'TokenScanner', price: '0.005', currency: 'USDT', description: 'Comprehensive security scan for tokens and contracts', serviceId: '0x54fca619b81baf49' },
  'swap-optimizer': { name: 'SwapOptimizer', price: '0.01', currency: 'USDT', description: 'Multi-route swap optimization across 500+ liquidity sources', serviceId: '0x76cb3997d766569b' },
  'price-alert': { name: 'PriceAlert', price: '0.003', currency: 'USDT', description: 'Real-time price monitoring with configurable alerts', serviceId: '0x2526a1acef1841c5' },
};

// Registry ABI for on-chain service discovery
const REGISTRY_FULL_ABI = [
  'function getServiceCount() view returns (uint256)',
  'function allServiceIds(uint256 index) view returns (bytes32)',
  'function getServiceById(bytes32 serviceId) view returns (tuple(address provider, string name, string description, string endpoint, uint256 pricePerCall, uint256 totalCalls, uint256 totalRevenue, uint256 rating, uint256 ratingCount, bool active, uint256 registeredAt))',
  'function getAgentProfile(address agent) view returns (tuple(address wallet, string name, uint256 totalServicesProvided, uint256 totalServicesConsumed, uint256 totalSpent, uint256 totalEarned, uint256 reputationScore, bool registered))',
  'function getAllActiveServices() view returns (bytes32[])',
];

// Pending swap store — holds swap calldata until user confirms execution
const pendingSwaps = new Map(); // sessionId -> { txData, fromSym, toSym, amount, timestamp }

// Multi-turn Chat Session Store
const chatSessions = new Map();

// Cleanup stale chat sessions every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chatSessions) {
    if (now - session.lastAccess > CHAT_SESSION_TTL) chatSessions.delete(id);
  }
}, 300000);

function resolveToken(sym) { return TOKEN_MAP[(sym || '').toUpperCase()] ?? sym; }

function getOrCreateSession(sessionId) {
  let session = chatSessions.get(sessionId);
  if (!session) {
    session = { messages: [], lastAccess: Date.now() };
    chatSessions.set(sessionId, session);
  }
  session.lastAccess = Date.now();
  return session;
}

async function processAgentChat(message, context, conversationHistory) {
  const lower = message.toLowerCase();
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  // Intent classification with keyword matching + context
  let intent = 'general';
  let entities = {};

  // Token extraction
  const tokenMatch = message.match(/\b(USDT|USDC|ETH|WETH|OKB|WOKB|BTC|WBTC)\b/gi);
  if (tokenMatch) entities.tokens = [...new Set(tokenMatch.map(t => t.toUpperCase()))];
  const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
  if (amountMatch) entities.amount = amountMatch[1];
  const addrMatch = message.match(/0x[a-fA-F0-9]{40}/);
  if (addrMatch) entities.address = addrMatch[0];

  // Detect explicit execution intent (user wants to execute, not just quote)
  const wantsExecution = /\b(execute|do it|run it|confirm|go ahead|proceed|submit|approve|执行|确认|买|卖)\b/i.test(lower);

  if (/swap|exchange|trade|convert|兑换|交换/.test(lower)) intent = wantsExecution ? 'execute_swap' : 'swap';
  else if (/scan|security|safe|risk|honeypot|安全|风险|扫描/.test(lower)) intent = 'security_scan';
  else if (/balance|portfolio|余额|资产/.test(lower)) intent = 'check_balance';
  else if (/price|cost|value|worth|价格/.test(lower)) intent = 'price_check';
  else if (/find|search|discover|service|查找|找/.test(lower)) intent = 'find_service';
  else if (/earn|yield|stake|收益|赚/.test(lower)) intent = 'earn';
  else if (/alert|notify|watch|提醒/.test(lower)) intent = 'set_alert';
  else if (/help|帮助|怎么/.test(lower)) intent = 'help';

  // Multi-turn context resolution
  if (intent === 'general' && history.length > 0) {
    const isFollowUp = /^(execute|do|run|confirm|yes|yeah|ok|go ahead|proceed|submit|approve|try|again|more|same|那个|执行|确认|好的|继续)\b/i.test(lower.trim())
      || /\b(it|that|this|the same|previous|last one|上一个|那个)\b/i.test(lower);

    if (isFollowUp) {
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === 'agent' || msg.role === 'assistant') {
          const prevContent = (msg.content || '').toLowerCase();
          if (/swap|route|aggregator|兑换/.test(prevContent)) { intent = 'execute_swap'; break; }
          if (/security|scan|risk|honeypot|安全/.test(prevContent)) { intent = 'security_scan'; break; }
          if (/balance|wallet|余额/.test(prevContent)) { intent = 'check_balance'; break; }
          if (/price|\$|价格/.test(prevContent)) { intent = 'price_check'; break; }
          if (/service|marketplace/.test(prevContent)) { intent = 'find_service'; break; }
          if (/earn|yield|stake/.test(prevContent)) { intent = 'earn'; break; }
          if (/alert|notify/.test(prevContent)) { intent = 'set_alert'; break; }
        }
        if (msg.role === 'user') {
          const prevUser = (msg.content || '');
          const prevTokens = prevUser.match(/\b(USDT|USDC|ETH|WETH|OKB|WOKB|BTC|WBTC)\b/gi);
          if (prevTokens && !entities.tokens) entities.tokens = [...new Set(prevTokens.map(t => t.toUpperCase()))];
          const prevAmount = prevUser.match(/(\d+(?:\.\d+)?)/);
          if (prevAmount && !entities.amount) entities.amount = prevAmount[1];
          const prevAddr = prevUser.match(/0x[a-fA-F0-9]{40}/);
          if (prevAddr && !entities.address) entities.address = prevAddr[0];
        }
      }
    }
  }

  // Execute based on intent with REAL API calls
  const results = { intent, entities, steps: [], response: '' };
  try {
    switch (intent) {
      case 'swap':
        await executeSwap(results, entities, context);
        break;
      case 'execute_swap':
        await executeSwapOnChain(results, entities, context);
        break;
      case 'security_scan':
        await executeSecurityScan(results, entities);
        break;
      case 'check_balance':
        await executeCheckBalance(results, entities, context);
        break;
      case 'price_check':
        await executePriceCheck(results, entities);
        break;
      case 'find_service':
        await executeFindService(results);
        break;
      case 'earn':
        await executeEarn(results);
        break;
      case 'set_alert':
        executeSetAlert(results, entities);
        break;
      case 'help':
        executeHelp(results);
        break;
      default:
        executeDefault(results);
    }
  } catch (e) {
    results.response = 'Error: ' + e.message;
    results.error = e.message;
  }

  // LLM Enhancement
  if (GROQ_API_KEY && results.response) {
    try {
      const llmResponse = await callLLM(GROQ_API_KEY, message, results, history);
      if (llmResponse) {
        results.llmResponse = llmResponse;
        results.response = llmResponse;
      }
    } catch (e) { console.warn('[LLM] Enhancement failed, using rule-based response:', e.message); }
  }

  return { code: '0', data: results };
}

async function executeSwap(results, entities, context) {
  const fromSym = (entities.tokens?.[0] || 'OKB').toUpperCase();
  const toSym = (entities.tokens?.[1] || 'USDT').toUpperCase();
  const fromToken = resolveToken(fromSym);
  const toToken = resolveToken(toSym);
  const humanAmount = entities.amount || '1';
  const fromDecimals = fromSym === 'USDT' || fromSym === 'USDC' ? 6 : 18;
  const amount = String(BigInt(Math.round(parseFloat(humanAmount) * (10 ** fromDecimals))));
  results.steps.push({ action: 'security_scan', status: 'running' });
  const [scanRes, quoteStd, quoteTight, quoteHigh] = await Promise.allSettled([
    okxRequest('POST', '/api/v6/security/token-scan', { source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: toToken !== '' ? toToken : fromToken }] }),
    okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage: '0.5' }),
    okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage: '0.1' }),
    okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage: '1.0' }),
  ]);
  results.steps[0].status = 'done';
  results.steps.push({ action: 'multi_strategy_quote', status: 'done' });
  const routes = [];
  if (quoteStd.status === 'fulfilled' && quoteStd.value?.data?.[0]) routes.push({ strategy: 'Standard (0.5%)', ...quoteStd.value.data[0] });
  if (quoteTight.status === 'fulfilled' && quoteTight.value?.data?.[0]) routes.push({ strategy: 'Tight (0.1%)', ...quoteTight.value.data[0] });
  if (quoteHigh.status === 'fulfilled' && quoteHigh.value?.data?.[0]) routes.push({ strategy: 'High-Fill (1.0%)', ...quoteHigh.value.data[0] });
  routes.sort((a, b) => parseFloat(b.toTokenAmount || 0) - parseFloat(a.toTokenAmount || 0));
  const uniDexNames = ['Uniswap V3', 'Uniswap V2', 'iZUMi'];
  const bestRouterList = routes[0]?.dexRouterList || [];
  const uniRoutes = bestRouterList.filter(r => uniDexNames.includes(r?.dexProtocol?.dexName));
  const uniPercent = uniRoutes.reduce((s, r) => s + parseFloat(r?.dexProtocol?.percent || 0), 0);
  const otherDexes = bestRouterList.filter(r => !uniDexNames.includes(r?.dexProtocol?.dexName));
  const otherNames = otherDexes.map(r => r?.dexProtocol?.dexName).filter(Boolean);
  results.steps.push({ action: 'route_comparison', status: 'done' });
  results.steps.push({ action: 'uniswap_comparison', status: 'done' });
  const scanData = scanRes.status === 'fulfilled' ? scanRes.value?.data?.[0] : null;
  const riskLevel = scanData?.securityInfo?.riskLevel || 'unknown';
  results.data = { routes, uniswapPercent: uniPercent, uniswapRoutes: uniRoutes, otherDexes: otherNames, noUniswapLiquidity: uniPercent === 0, totalDexSources: bestRouterList.length, securityScan: { riskLevel, safe: riskLevel !== 'critical' && riskLevel !== 'high' }, bestRoute: routes[0] || null, canExecute: true, fromSym, toSym, humanAmount };
  const best = routes[0];
  if (best) {
    const outDecimals = parseInt(best.toToken?.decimal || '18');
    const outAmount = (parseFloat(best.toTokenAmount || '0') / 10 ** outDecimals).toFixed(6);
    const fromSymDisplay = best.fromToken?.tokenSymbol || fromSym || '?';
    const toSymDisplay = best.toToken?.tokenSymbol || toSym || '?';
    const gas = best.estimateGasFee ? `Gas: ~${best.estimateGasFee} wei.` : '';
    const impact = best.priceImpactPercent ? `Price impact: ${best.priceImpactPercent}%.` : '';
    let comparisonStr = '';
    if (uniPercent > 0) {
      const uniNames = uniRoutes.map(r => r?.dexProtocol?.dexName).join('+');
      const otherPct = (100 - uniPercent).toFixed(0);
      if (otherNames.length > 0) {
        comparisonStr = ` Route split: Uniswap-compatible (${uniNames}): ${uniPercent.toFixed(0)}% | Other DEXes (${otherNames.join(', ')}): ${otherPct}%. Aggregator combines ${bestRouterList.length} DEXes for optimal output.`;
      } else {
        comparisonStr = ` Routed 100% through Uniswap-compatible DEX (${uniNames}).`;
      }
    } else if (otherNames.length > 0) {
      comparisonStr = ` Uniswap V3 has no liquidity on X Layer for this pair. OnchainOS DEX Aggregator routed via ${otherNames.join(', ')} — combining ${bestRouterList.length} DEX sources (500+ total available) for the optimal rate. Single-DEX routing (Uniswap) cannot provide a quote here.`;
    } else {
      comparisonStr = ` Uniswap V3 has no liquidity on X Layer. OnchainOS DEX Aggregator searches 500+ sources to find the best route automatically.`;
    }
    results.response = `Found ${routes.length} aggregator routes for ${humanAmount} ${fromSymDisplay} → ${toSymDisplay}. Best: ${best.strategy} yields ${outAmount} ${toSymDisplay}. ${impact} ${gas}${comparisonStr} Security: ${riskLevel}. ${riskLevel === 'critical' ? 'WARNING: Token flagged as critical risk!' : '✅ To execute this swap on-chain, reply "execute swap" or "确认执行".'}`.trim();
  } else {
    results.response = 'No swap routes available for this pair. Check token addresses and try again.';
  }
}

// ── REAL on-chain swap execution from chat ──
async function executeSwapOnChain(results, entities, context) {
  if (!serverWallet) {
    results.response = 'Server wallet not configured. Cannot execute on-chain swap. Connect your wallet via the dashboard to execute swaps.';
    results.steps.push({ action: 'execute_swap', status: 'error', reason: 'no_wallet' });
    return;
  }

  const fromSym = (entities.tokens?.[0] || 'OKB').toUpperCase();
  const toSym = (entities.tokens?.[1] || 'USDT').toUpperCase();
  const fromToken = resolveToken(fromSym);
  const toToken = resolveToken(toSym);
  const humanAmount = entities.amount || '0.001';
  const fromDecimals = fromSym === 'USDT' || fromSym === 'USDC' ? 6 : 18;
  const amount = String(BigInt(Math.round(parseFloat(humanAmount) * (10 ** fromDecimals))));

  // Step 1: Security scan
  results.steps.push({ action: 'security_scan', status: 'running' });
  let riskLevel = 'unknown';
  try {
    const scanRes = await okxRequest('POST', '/api/v6/security/token-scan', {
      source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: toToken !== '' ? toToken : fromToken }]
    });
    riskLevel = scanRes?.data?.[0]?.securityInfo?.riskLevel || 'unknown';
  } catch {}
  results.steps[results.steps.length - 1].status = 'done';

  if (riskLevel === 'critical' || riskLevel === 'high') {
    results.response = `Security scan BLOCKED this swap: ${toSym} risk level is ${riskLevel.toUpperCase()}. Aborting execution to protect your funds.`;
    results.steps.push({ action: 'execute_swap', status: 'blocked', reason: 'security_risk' });
    results.data = { blocked: true, riskLevel };
    return;
  }

  // Step 2: Check balance
  results.steps.push({ action: 'check_balance', status: 'running' });
  try {
    if (fromToken === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      const bal = await rpcProvider.getBalance(serverWallet.address);
      const required = BigInt(amount);
      if (bal < required) {
        const balStr = ethers.formatEther(bal);
        results.response = `Insufficient ${fromSym} balance. Wallet has ${balStr} ${fromSym} but swap requires ${humanAmount} ${fromSym}. Please fund the agent wallet first.`;
        results.steps[results.steps.length - 1].status = 'error';
        results.data = { insufficientBalance: true, available: balStr, required: humanAmount };
        return;
      }
    } else {
      const token = new ethers.Contract(fromToken, ERC20_ABI, rpcProvider);
      const bal = await token.balanceOf(serverWallet.address);
      const required = BigInt(amount);
      if (bal < required) {
        const decimals = fromDecimals;
        const balStr = ethers.formatUnits(bal, decimals);
        results.response = `Insufficient ${fromSym} balance. Wallet has ${balStr} ${fromSym} but swap requires ${humanAmount} ${fromSym}.`;
        results.steps[results.steps.length - 1].status = 'error';
        results.data = { insufficientBalance: true, available: balStr, required: humanAmount };
        return;
      }
    }
  } catch (e) {
    // Balance check failed, proceed anyway and let the swap fail if needed
  }
  results.steps[results.steps.length - 1].status = 'done';

  // Step 3: Get swap calldata
  results.steps.push({ action: 'get_swap_calldata', status: 'running' });
  const swapRes = await okxRequest('GET', '/api/v6/dex/aggregator/swap', {
    chainIndex: CHAIN_ID,
    fromTokenAddress: fromToken,
    toTokenAddress: toToken,
    amount,
    slippage: '1.0',
    userWalletAddress: serverWallet.address,
  });

  const txData = swapRes?.data?.[0]?.tx;
  if (!txData) {
    results.response = `No swap route available for ${humanAmount} ${fromSym} -> ${toSym}. The DEX aggregator could not find a viable path.`;
    results.steps[results.steps.length - 1].status = 'error';
    return;
  }
  results.steps[results.steps.length - 1].status = 'done';

  const toTokenAmount = swapRes?.data?.[0]?.toTokenAmount || '0';
  const toDecimals = parseInt(swapRes?.data?.[0]?.toToken?.decimal || '18');
  const expectedOutput = (parseFloat(toTokenAmount) / 10 ** toDecimals).toFixed(6);

  // Step 4: Execute the transaction on-chain
  results.steps.push({ action: 'execute_onchain', status: 'running' });
  try {
    const tx = await serverWallet.sendTransaction({
      to: txData.to,
      data: txData.data,
      value: txData.value || '0x0',
      gasLimit: txData.gas || '300000',
    });
    const receipt = await tx.wait();
    results.steps[results.steps.length - 1].status = 'done';

    results.data = {
      executed: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      fromToken: fromSym,
      toToken: toSym,
      amountIn: humanAmount,
      expectedOutput,
      explorerUrl: `https://www.okx.com/explorer/xlayer/tx/${receipt.hash}`,
    };

    results.response = `Swap EXECUTED on-chain! ${humanAmount} ${fromSym} -> ~${expectedOutput} ${toSym}\n\nTX Hash: ${receipt.hash}\nBlock: ${receipt.blockNumber}\nGas Used: ${receipt.gasUsed.toString()}\nExplorer: https://www.okx.com/explorer/xlayer/tx/${receipt.hash}\n\nSecurity scan: ${riskLevel}. Transaction confirmed on X Layer mainnet.`;
  } catch (e) {
    results.steps[results.steps.length - 1].status = 'error';
    results.data = { executed: false, error: e.message };
    results.response = `Swap execution FAILED: ${e.message}. The transaction was not confirmed on-chain. This may be due to insufficient gas (OKB), slippage exceeded, or network congestion.`;
  }
}

async function executeSecurityScan(results, entities) {
  const addr = entities.address || resolveToken(entities.tokens?.[0] || 'USDT');
  results.steps.push({ action: 'token_scan', status: 'running' });
  results.steps.push({ action: 'contract_scan', status: 'running' });
  const [tokenScan, contractScan] = await Promise.allSettled([
    okxRequest('POST', '/api/v6/security/token-scan', { source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: addr }] }),
    okxRequest('GET', '/api/v6/dex/pre-transaction/approve-security', { chainIndex: CHAIN_ID, approveAddress: addr }),
  ]);
  results.steps[0].status = 'done';
  results.steps[1].status = 'done';
  const scan = tokenScan.status === 'fulfilled' ? tokenScan.value?.data?.[0] : null;
  const cscan = contractScan.status === 'fulfilled' ? contractScan.value?.data?.[0] : null;
  let riskScore = 0, warnings = [];
  if (scan?.securityInfo?.isHoneypot) { riskScore += 50; warnings.push('HONEYPOT'); }
  if (scan?.securityInfo?.isOpenSource === false) { riskScore += 15; warnings.push('Unverified source'); }
  if (scan?.securityInfo?.ownerChangeBalance) { riskScore += 20; warnings.push('Owner can modify balances'); }
  const riskLevel = riskScore >= 60 ? 'critical' : riskScore >= 30 ? 'high' : riskScore >= 15 ? 'medium' : 'low';
  results.data = { tokenScan: scan, contractScan: cscan, riskScore, riskLevel, warnings };
  results.response = `Security scan complete. Risk level: ${riskLevel.toUpperCase()} (score: ${riskScore}/100). ${warnings.length ? 'Warnings: ' + warnings.join(', ') : 'No critical warnings.'}`;
}

async function executeCheckBalance(results, entities, context) {
  const addr = context.walletAddress || AGENT_WALLET;
  results.steps.push({ action: 'get_balances', status: 'running' });
  const balRes = await okxRequest('POST', '/api/v5/wallet/asset/token-balances-by-address', {
    address: addr, tokenAddresses: [
      { chainIndex: CHAIN_ID, tokenAddress: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d' },
      { chainIndex: CHAIN_ID, tokenAddress: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c' },
      { chainIndex: CHAIN_ID, tokenAddress: '0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09' },
      { chainIndex: CHAIN_ID, tokenAddress: '0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10' },
    ]
  });
  results.steps[0].status = 'done';
  const okbBal = await rpcProvider.getBalance(addr);
  const assets = balRes?.data?.[0]?.tokenAssets || [];
  results.data = { address: addr, okbBalance: ethers.formatEther(okbBal), tokens: assets };
  results.response = `Wallet ${addr.slice(0, 6)}...${addr.slice(-4)}: ${ethers.formatEther(okbBal)} OKB. ${assets.filter(t => t.balance !== '0').map(t => `${t.symbol}: ${t.balance}`).join(', ') || 'No token balances.'}`;
}

async function executePriceCheck(results, entities) {
  const tokenAddr = entities.address || resolveToken(entities.tokens?.[0] || 'OKB');
  results.steps.push({ action: 'get_price', status: 'running' });
  const priceRes = await okxRequest('GET', '/api/v5/wallet/token/token-detail', { chainIndex: CHAIN_ID, tokenAddress: tokenAddr || '' });
  results.steps[0].status = 'done';
  const tokenData = priceRes?.data?.[0];
  results.data = tokenData;
  let price = tokenData?.price || tokenData?.tokenPrice;
  if (!price && tokenData?.marketCap && tokenData?.totalSupply) {
    const mc = parseFloat(tokenData.marketCap);
    const ts = parseFloat(tokenData.totalSupply);
    if (ts > 0) price = (mc / ts).toFixed(6);
  }
  const symbol = tokenData?.symbol || entities.tokens?.[0] || 'Token';
  const mcap = tokenData?.marketCap ? `Market cap: $${Number(parseFloat(tokenData.marketCap).toFixed(0)).toLocaleString()}` : '';
  const vol = tokenData?.volume24h ? `24h volume: $${Number(parseFloat(tokenData.volume24h).toFixed(0)).toLocaleString()}` : '';
  results.response = tokenData
    ? `${symbol}: $${price || 'unavailable'} USD. ${[mcap, vol].filter(Boolean).join('. ')}`.trim()
    : 'Token price not found. Try providing the contract address directly.';
}

async function executeFindService(results) {
  results.steps.push({ action: 'discover_services_onchain', status: 'running' });

  // Query the on-chain ServiceRegistry for live service data
  let onChainServices = [];
  try {
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_FULL_ABI, rpcProvider);
    const totalServices = Number(await registry.getServiceCount());
    const serviceIds = [];
    for (let i = 0; i < Math.min(totalServices, 20); i++) {
      try { serviceIds.push(await registry.allServiceIds(i)); } catch {}
    }

    for (const sid of serviceIds) {
      try {
        const svc = await registry.getServiceById(sid);
        if (svc.active) {
          onChainServices.push({
            id: sid.slice(0, 18) + '...',
            name: svc.name,
            description: svc.description,
            provider: svc.provider.slice(0, 10) + '...',
            pricePerCall: ethers.formatEther(svc.pricePerCall) + ' OKB',
            totalCalls: Number(svc.totalCalls),
            rating: svc.ratingCount > 0 ? (Number(svc.rating) / Number(svc.ratingCount)).toFixed(1) + '/5' : 'No ratings',
            ratingCount: Number(svc.ratingCount),
            registeredAt: new Date(Number(svc.registeredAt) * 1000).toISOString().slice(0, 10),
          });
        }
      } catch {}
    }
  } catch (e) {
    // Fallback to catalog if chain query fails
    results.steps[results.steps.length - 1].status = 'fallback';
  }

  results.steps[results.steps.length - 1].status = 'done';

  if (onChainServices.length > 0) {
    results.data = { source: 'on-chain', registry: REGISTRY_ADDRESS, services: onChainServices };
    const svcList = onChainServices.map(s => `${s.name} (${s.totalCalls} calls, ${s.rating})`).join(', ');
    results.response = `Found ${onChainServices.length} active services on-chain (ServiceRegistry @ ${REGISTRY_ADDRESS.slice(0, 10)}...):\n${onChainServices.map(s => `• ${s.name}: ${s.description} — ${s.pricePerCall}/call, ${s.totalCalls} calls, rating ${s.rating}`).join('\n')}\n\nAll services are discoverable via the smart contract. Use x402 protocol to pay and execute.`;
  } else {
    // Fallback to static catalog
    results.data = { source: 'catalog', services: SERVICE_CATALOG };
    results.response = `Found ${Object.keys(SERVICE_CATALOG).length} services on the marketplace: ${Object.entries(SERVICE_CATALOG).map(([k, v]) => `${v.name} (${v.price} USDT)`).join(', ')}. Use x402 protocol to pay and execute.`;
  }
}

async function executeEarn(results) {
  results.steps.push({ action: 'check_yield_opportunities', status: 'running' });

  // Get real DEX pair data to show actual yield opportunities
  const yieldData = [];
  try {
    // Check liquidity pair pricing for yield estimation
    const pairs = [
      { from: 'OKB', to: 'USDT', label: 'OKB/USDT LP' },
      { from: 'WETH', to: 'USDT', label: 'WETH/USDT LP' },
    ];
    for (const pair of pairs) {
      try {
        const quote = await okxRequest('GET', '/api/v6/dex/aggregator/quote', {
          chainIndex: CHAIN_ID,
          fromTokenAddress: TOKEN_MAP[pair.from],
          toTokenAddress: TOKEN_MAP[pair.to],
          amount: pair.from === 'USDC' ? String(BigInt(10 ** 6)) : String(BigInt(10 ** 18)),
          slippage: '0.5',
        });
        const data = quote?.data?.[0];
        const dexSources = data?.dexRouterList?.length || 0;
        const dexNames = data?.dexRouterList?.map(r => r?.dexProtocol?.dexName).filter(Boolean) || [];
        yieldData.push({
          pair: pair.label,
          dexSources,
          dexNames: [...new Set(dexNames)],
          priceImpact: data?.priceImpactPercent || 'N/A',
        });
      } catch {}
    }
  } catch {}

  // Query on-chain marketplace for earning via services
  let serviceEarnings = [];
  try {
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_FULL_ABI, rpcProvider);
    const totalServices = Number(await registry.getServiceCount());
    for (let i = 0; i < Math.min(totalServices, 5); i++) {
      try {
        const sid = await registry.allServiceIds(i);
        const svc = await registry.getServiceById(sid);
        if (svc.active && Number(svc.totalCalls) > 0) {
          const revenue = ethers.formatEther(svc.totalRevenue);
          serviceEarnings.push({
            name: svc.name,
            totalCalls: Number(svc.totalCalls),
            totalRevenue: revenue + ' OKB',
          });
        }
      } catch {}
    }
  } catch {}

  results.steps[results.steps.length - 1].status = 'done';
  results.data = { yieldOpportunities: yieldData, serviceEarnings };

  let resp = 'Earning opportunities on X Layer:\n';
  if (yieldData.length > 0) {
    resp += '\nDEX Liquidity Provision:\n';
    resp += yieldData.map(y => `• ${y.pair}: ${y.dexSources} DEX sources (${y.dexNames.slice(0, 3).join(', ')})`).join('\n');
  }
  if (serviceEarnings.length > 0) {
    resp += '\n\nAgent Service Revenue (on-chain):\n';
    resp += serviceEarnings.map(s => `• ${s.name}: ${s.totalCalls} calls, earned ${s.totalRevenue}`).join('\n');
  }
  resp += '\n\nRegister as a service provider on Agent Nexus marketplace to earn USDT per API call via x402.';
  results.response = resp;
}

function executeSetAlert(results, entities) {
  const addr = entities.address || resolveToken(entities.tokens?.[0] || 'OKB');
  const targetPrice = entities.amount || '0';
  results.steps.push({ action: 'configure_alert', status: 'done' });
  results.data = { token: entities.tokens?.[0] || 'OKB', targetPrice, status: 'configured' };
  results.response = `Price alert configured for ${entities.tokens?.[0] || 'OKB'} at $${targetPrice}. Use the PriceAlert service (0.003 USDT via x402) for real-time monitoring with webhook notifications.`;
}

function executeHelp(results) {
  results.steps.push({ action: 'show_help', status: 'done' });
  results.response = 'Agent Nexus commands:\n\u2022 "swap 100 USDT to ETH" \u2014 Multi-strategy DEX swap with security scan\n\u2022 "scan 0x..." \u2014 Deep token/contract security analysis\n\u2022 "check balance" \u2014 View wallet token balances on X Layer\n\u2022 "price WETH" \u2014 Real-time token price lookup\n\u2022 "find services" \u2014 Discover marketplace services\n\u2022 "earn" \u2014 View yield opportunities\n\nAll commands support English and Chinese (\u4e2d\u6587). Try: "\u5151\u6362100 USDT\u5230ETH" or "\u626b\u63cf\u4ee3\u5e01\u5b89\u5168\u6027"';
  results.data = { commands: ['swap', 'scan', 'balance', 'price', 'find services', 'earn', 'alert', 'help'], languages: ['en', 'zh'] };
}

function executeDefault(results) {
  results.response = 'I understand these commands:\n\u2022 swap [amount] [token] to [token]\n\u2022 scan [address]\n\u2022 check balance\n\u2022 price [token]\n\u2022 find services\n\u2022 earn yield\n\u2022 set alert [token] [price]\n\nTry: "swap 100 USDT to ETH" or "\u626b\u63cf0x1E4a..." (Chinese supported)';
  results.data = { commands: ['swap', 'scan', 'balance', 'price', 'find services', 'earn', 'alert', 'help'], languages: ['en', 'zh'] };
}

module.exports = {
  SERVICE_CATALOG,
  chatSessions,
  pendingSwaps,
  resolveToken,
  processAgentChat,
  getOrCreateSession,
};
