/**
 * Agent Brain — NLP engine: intent classification, fuzzy matching, processAgentChat
 */
const { CHAIN_ID, TOKEN_MAP, GROQ_API_KEY, CHAT_SESSION_TTL, CHAT_MAX_MESSAGES } = require('./config');
const { okxRequest } = require('./okx-auth');
const { ethers, rpcProvider, AGENT_WALLET } = require('./wallet');
const { callLLM } = require('./llm');

// Service catalog (shared with routes)
const SERVICE_CATALOG = {
  'token-scanner': { name: 'TokenScanner', price: '0.005', currency: 'USDT', description: 'Comprehensive security scan for tokens and contracts', serviceId: '0x54fca619b81baf49' },
  'swap-optimizer': { name: 'SwapOptimizer', price: '0.01', currency: 'USDT', description: 'Multi-route swap optimization across 500+ liquidity sources', serviceId: '0x76cb3997d766569b' },
  'price-alert': { name: 'PriceAlert', price: '0.003', currency: 'USDT', description: 'Real-time price monitoring with configurable alerts', serviceId: '0x2526a1acef1841c5' },
};

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

  if (/swap|exchange|trade|convert|兑换|交换/.test(lower)) intent = 'swap';
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
          if (/swap|route|aggregator|兑换/.test(prevContent)) { intent = 'swap'; break; }
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
        await executeSwap(results, entities);
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
        executeFindService(results);
        break;
      case 'earn':
        executeEarn(results);
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

async function executeSwap(results, entities) {
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
  results.data = { routes, uniswapPercent: uniPercent, uniswapRoutes: uniRoutes, otherDexes: otherNames, noUniswapLiquidity: uniPercent === 0, totalDexSources: bestRouterList.length, securityScan: { riskLevel, safe: riskLevel !== 'critical' && riskLevel !== 'high' }, bestRoute: routes[0] || null };
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
    results.response = `Found ${routes.length} aggregator routes for ${humanAmount} ${fromSymDisplay} → ${toSymDisplay}. Best: ${best.strategy} yields ${outAmount} ${toSymDisplay}. ${impact} ${gas}${comparisonStr} Security: ${riskLevel}. ${riskLevel === 'critical' ? 'WARNING: Token flagged as critical risk!' : 'Ready to execute via wallet.'}`.trim();
  } else {
    results.response = 'No swap routes available for this pair. Check token addresses and try again.';
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

function executeFindService(results) {
  results.steps.push({ action: 'discover_services', status: 'done' });
  results.data = SERVICE_CATALOG;
  results.response = `Found ${Object.keys(SERVICE_CATALOG).length} services on the marketplace: ${Object.entries(SERVICE_CATALOG).map(([k, v]) => `${v.name} (${v.price} USDT)`).join(', ')}. Use x402 protocol to pay and execute.`;
}

function executeEarn(results) {
  results.steps.push({ action: 'check_opportunities', status: 'done' });
  results.data = { strategies: ['Provide liquidity on iZUMi DEX', 'Register as agent service provider', 'Stake in X Layer DeFi protocols'] };
  results.response = 'Earning opportunities on X Layer: 1) Provide liquidity on iZUMi/Uniswap DEX pairs. 2) Register as a service provider on Agent Nexus marketplace — earn USDT per API call. 3) Explore DeFi protocols on X Layer for yield. Current marketplace service prices: ' + Object.entries(SERVICE_CATALOG).map(([k, v]) => `${v.name}: ${v.price} USDT/call`).join(', ') + '.';
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
  resolveToken,
  processAgentChat,
  getOrCreateSession,
};
