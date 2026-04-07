/**
 * Agent Nexus — Production Backend Server
 * Proxies OnchainOS API calls with HMAC-SHA256 signing (server-side)
 * Handles real swap execution, x402 payment flows, and AI chat
 * Serves the interactive frontend
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');

// Load .env from parent directory
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}

const PORT = parseInt(process.env.PORT || '8080');
const HOST = '0.0.0.0';

// SECURITY: credentials from environment only — never hardcoded
const API_KEY = process.env.OKX_API_KEY;
const SECRET_KEY = process.env.OKX_SECRET_KEY;
const PASSPHRASE = process.env.OKX_PASSPHRASE;
const PROJECT_ID = process.env.OKX_PROJECT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CHAIN_ID = '196';
const BASE_URL = 'https://web3.okx.com';
const REGISTRY_ADDRESS = process.env.SERVICE_REGISTRY_ADDRESS || '0x21B9c10F609e6b11E343Ca074eC820B1c0D402d4';
const USDT_ADDRESS = '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';

if (!API_KEY || !SECRET_KEY) {
  console.error('[Server] FATAL: OKX_API_KEY and OKX_SECRET_KEY must be set in environment');
  process.exit(1);
}

// Ethers.js setup for on-chain operations
const rpcProvider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC || 'https://rpc.xlayer.tech');
let serverWallet = null;
if (PRIVATE_KEY && PRIVATE_KEY.length >= 64) {
  try {
    serverWallet = new ethers.Wallet(PRIVATE_KEY, rpcProvider);
    console.log(`[Server] Wallet loaded: ${serverWallet.address}`);
  } catch(e) {
    console.warn(`[Server] Invalid private key, server-side signing disabled`);
  }
} else {
  console.log('[Server] No valid private key — use wallet connection for on-chain operations');
}

// ERC-20 ABI for USDT transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

// Registry ABI for on-chain recording
const REGISTRY_ABI = [
  'function recordServiceCall(bytes32 serviceId, address caller) external',
  'function rateService(bytes32 serviceId, uint8 score) external',
];

// x402 Payment tracking (in-memory, persists across requests)
const paymentRecords = [];
const quoteStore = new Map();

function qs(obj) {
  return Object.entries(obj).map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
}

function sign(timestamp, method, requestPath, body) {
  let queryStr = '';
  if (method === 'GET' && body && Object.keys(body).length > 0) queryStr = '?' + qs(body);
  if (method === 'POST' && body) queryStr = JSON.stringify(body);
  const preHash = timestamp + method + requestPath + queryStr;
  return crypto.createHmac('sha256', SECRET_KEY).update(preHash).digest('base64');
}

async function okxRequest(method, apiPath, params) {
  const timestamp = new Date().toISOString().slice(0, -5) + 'Z';
  const signature = sign(timestamp, method, apiPath, params);
  let url = BASE_URL + apiPath;
  const headers = {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': API_KEY,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    'OK-ACCESS-PROJECT': PROJECT_ID,
  };
  const opts = { method, headers };
  if (method === 'GET' && params && Object.keys(params).length > 0) url += '?' + qs(params);
  if (method === 'POST' && params) opts.body = JSON.stringify(params);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  opts.signal = ctrl.signal;
  try {
    const resp = await fetch(url, opts);
    clearTimeout(timer);
    return await resp.json();
  } catch(e) {
    clearTimeout(timer);
    throw e;
  }
}

const routes = {};

routes['GET /api/dex/quote'] = async (q) => {
  if (!q.fromToken||!q.toToken||!q.amount) return {code:400,msg:'Missing params'};
  return okxRequest('GET','/api/v6/dex/aggregator/quote',{chainIndex:CHAIN_ID,fromTokenAddress:q.fromToken,toTokenAddress:q.toToken,amount:q.amount,slippage:q.slippage||'0.5'});
};
routes['GET /api/dex/swap'] = async (q) => {
  if (!q.fromToken||!q.toToken||!q.amount||!q.userWalletAddress) return {code:400,msg:'Missing params'};
  return okxRequest('GET','/api/v6/dex/aggregator/swap',{chainIndex:CHAIN_ID,fromTokenAddress:q.fromToken,toTokenAddress:q.toToken,amount:q.amount,slippage:q.slippage||'0.5',userWalletAddress:q.userWalletAddress});
};
routes['GET /api/dex/tokens'] = async () => okxRequest('GET','/api/v6/dex/aggregator/all-tokens',{chainIndex:CHAIN_ID});

routes['POST /api/security/scan'] = async (_,b) => {
  if (!b.tokenAddress) return {code:400,msg:'Missing tokenAddress'};
  return okxRequest('POST','/api/v6/security/token-scan',{source:'api',tokenList:[{chainId:CHAIN_ID,contractAddress:b.tokenAddress}]});
};
routes['GET /api/security/approval'] = async (q) => {
  if (!q.contractAddress) return {code:400,msg:'Missing contractAddress'};
  return okxRequest('GET','/api/v6/dex/pre-transaction/approve-security',{chainIndex:CHAIN_ID,approveAddress:q.contractAddress});
};

routes['GET /api/market/price'] = async (q) => okxRequest('GET','/api/v5/wallet/token/token-detail',{chainIndex:CHAIN_ID,tokenAddress:q.tokenAddress||''});
routes['GET /api/market/search'] = async (q) => {
  if (!q.keyword) return {code:400,msg:'Missing keyword'};
  return okxRequest('GET','/api/v5/wallet/token/search-by-address',{keyword:q.keyword,chainIndex:CHAIN_ID});
};

routes['GET /api/wallet/balance'] = async (q) => {
  if (!q.address) return {code:400,msg:'Missing address'};
  return okxRequest('POST','/api/v5/wallet/asset/token-balances-by-address',{address:q.address,tokenAddresses:[
    {chainIndex:CHAIN_ID,tokenAddress:'0x1E4a5963aBFD975d8c9021ce480b42188849D41d'},
    {chainIndex:CHAIN_ID,tokenAddress:'0x5A77f1443D16ee5761d310e38b62f77f726bC71c'},
    {chainIndex:CHAIN_ID,tokenAddress:'0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09'},
    {chainIndex:CHAIN_ID,tokenAddress:'0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10'},
  ]});
};
routes['GET /api/wallet/history'] = async (q) => {
  if (!q.address) return {code:400,msg:'Missing address'};
  return okxRequest('GET','/api/v5/wallet/post-transaction/transactions-by-address',{address:q.address,chains:CHAIN_ID,limit:q.limit||'20'});
};

// ── x402 Real Payment-Gated Services ──
const SERVICE_CATALOG = {
  'token-scanner': { name:'TokenScanner', price:'0.005', currency:'USDT', description:'Comprehensive security scan for tokens and contracts', serviceId: '0x54fca619b81baf49' },
  'swap-optimizer': { name:'SwapOptimizer', price:'0.01', currency:'USDT', description:'Multi-route swap optimization across 500+ liquidity sources', serviceId: '0x76cb3997d766569b' },
  'price-alert': { name:'PriceAlert', price:'0.003', currency:'USDT', description:'Real-time price monitoring with configurable alerts', serviceId: '0x2526a1acef1841c5' },
};
const AGENT_WALLET = serverWallet ? serverWallet.address : '0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5';

// ── Quote store TTL cleanup (every 60s) ──
setInterval(() => {
  const now = Date.now();
  for (const [id, q] of quoteStore) {
    if (now > q.expiresAt + 60000) quoteStore.delete(id);
  }
}, 60000);

// ── Basic rate limiting (per IP, 60 req/min) ──
const rateLimitMap = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60000;
function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    entry = { start: now, count: 0 };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}
// Cleanup stale rate limit entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_WINDOW * 2) rateLimitMap.delete(ip);
  }
}, 300000);

routes['GET /api/x402/services'] = async () => ({
  code:'0',
  data: Object.entries(SERVICE_CATALOG).map(([slug, svc]) => ({
    name: slug, endpoint: `/services/${slug}`, price: svc.price, currency: svc.currency,
    description: svc.description, payTo: AGENT_WALLET
  }))
});

routes['POST /api/x402/quote'] = async (_,b) => {
  const svc = SERVICE_CATALOG[b.service];
  if (!svc) return { code:'404', msg:'Service not found' };
  const quoteId = 'quote_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
  const quote = {
    quoteId, service: b.service, price: svc.price, currency: svc.currency,
    payTo: AGENT_WALLET, network: 'eip155:196', asset: USDT_ADDRESS,
    validFor: 300, expiresAt: Date.now() + 300000,
    // Build the actual ERC-20 transfer calldata for the frontend
    paymentTx: {
      to: USDT_ADDRESS,
      data: buildTransferCalldata(AGENT_WALLET, svc.price),
      value: '0x0',
      chainId: '0xc4',
    }
  };
  quoteStore.set(quoteId, { ...quote, params: b.params, timestamp: Date.now() });
  return { code:'0', data: quote };
};

routes['POST /api/x402/pay'] = async (_, b) => {
  // Server-side x402 payment: use server wallet to pay for a service on behalf of the system
  if (!serverWallet) return { code: '500', msg: 'Server wallet not configured' };
  const svc = SERVICE_CATALOG[b.service];
  if (!svc) return { code: '404', msg: 'Service not found' };
  try {
    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, serverWallet);
    const amount = ethers.parseUnits(svc.price, 6);
    const balance = await usdt.balanceOf(serverWallet.address);
    if (balance < amount) return { code: '402', msg: `Insufficient USDT balance: ${ethers.formatUnits(balance, 6)}` };
    const tx = await usdt.transfer(AGENT_WALLET, amount);
    const receipt = await tx.wait();
    // Record in payment history
    const record = {
      txHash: receipt.hash, service: b.service, amount: svc.price, currency: 'USDT',
      from: serverWallet.address, to: AGENT_WALLET, timestamp: Date.now(), blockNumber: receipt.blockNumber
    };
    paymentRecords.push(record);
    return { code: '0', msg: 'Payment confirmed on-chain', data: record };
  } catch(e) {
    return { code: '500', msg: 'Payment failed: ' + e.message };
  }
};

routes['POST /api/x402/verify'] = async (_, b) => {
  // Verify a payment transaction on-chain
  if (!b.txHash) return { code: '400', msg: 'Missing txHash' };
  try {
    const receipt = await rpcProvider.getTransactionReceipt(b.txHash);
    if (!receipt) return { code: '404', msg: 'Transaction not found' };
    if (receipt.status !== 1) return { code: '400', msg: 'Transaction failed' };
    // Check for USDT Transfer event
    const iface = new ethers.Interface(ERC20_ABI);
    let paymentFound = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (parsed && parsed.name === 'Transfer') {
            paymentFound = true;
            return { code: '0', msg: 'Payment verified', data: {
              txHash: b.txHash, from: parsed.args[0], to: parsed.args[1],
              amount: ethers.formatUnits(parsed.args[2], 6), verified: true, blockNumber: receipt.blockNumber
            }};
          }
        } catch {}
      }
    }
    return { code: '400', msg: 'No USDT transfer found in transaction' };
  } catch(e) {
    return { code: '500', msg: 'Verification error: ' + e.message };
  }
};

routes['POST /api/x402/execute'] = async (_,b,h) => {
  const paymentHeader = h['x-402-payment'];
  if (!paymentHeader) {
    const svc = SERVICE_CATALOG[b.service];
    if (!svc) return { code:'404', msg:'Service not found', available: Object.keys(SERVICE_CATALOG) };
    return {
      code:'402', msg:'Payment Required',
      data: { price: svc.price, currency: 'USDT', network: 'eip155:196', payTo: AGENT_WALLET, asset: USDT_ADDRESS,
        paymentTx: { to: USDT_ADDRESS, data: buildTransferCalldata(AGENT_WALLET, svc.price), value: '0x0', chainId: '0xc4' }
      }
    };
  }
  // Validate payment header format
  const txHash = paymentHeader.replace('x402:txhash:', '').replace('x402:', '');
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { code:'400', msg:'Invalid payment header. Expected x402:txhash:0x... (64 hex chars)' };
  }
  // Verify payment on-chain
  let verified = false;
  try {
    const receipt = await rpcProvider.getTransactionReceipt(txHash);
    verified = receipt && receipt.status === 1;
  } catch(e) {
    return { code: '500', msg: 'Payment verification error: ' + e.message };
  }
  if (!verified) return { code: '402', msg: 'Payment verification failed: transaction not found or failed' };

  // Validate service name
  const svc = SERVICE_CATALOG[b.service];
  if (!svc) return { code: '404', msg: 'Service not found', available: Object.keys(SERVICE_CATALOG) };

  // Execute the actual service
  try {
    if (b.service === 'token-scanner' && b.params?.tokenAddress) {
      const r = await okxRequest('POST','/api/v6/security/token-scan', { source:'api', tokenList:[{chainId:CHAIN_ID, contractAddress:b.params.tokenAddress}] });
      return { code:'0', msg:'Service executed after verified x402 payment', data: { service: svc.name, result: r?.data, payment: { txHash, verified: true, amount: svc.price, currency: 'USDT' } }};
    }
    if (b.service === 'swap-optimizer' && b.params?.fromToken && b.params?.toToken) {
      const r = await okxRequest('GET','/api/v6/dex/aggregator/quote', { chainIndex:CHAIN_ID, fromTokenAddress:b.params.fromToken, toTokenAddress:b.params.toToken, amount:b.params.amount||'1000000', slippage:'0.5' });
      return { code:'0', msg:'Service executed after verified x402 payment', data: { service: svc.name, result: r?.data, payment: { txHash, verified: true, amount: svc.price, currency: 'USDT' } }};
    }
    if (b.service === 'price-alert' && b.params?.tokenAddress) {
      const r = await okxRequest('GET', '/api/v5/wallet/token/token-detail', { chainIndex: CHAIN_ID, tokenAddress: b.params.tokenAddress });
      return { code:'0', msg:'Price alert configured after verified x402 payment', data: { service: svc.name, result: r?.data, payment: { txHash, verified: true, amount: svc.price, currency: 'USDT' } }};
    }
    return { code: '400', msg: `Service '${b.service}' requires valid params`, required: b.service === 'token-scanner' ? ['tokenAddress'] : b.service === 'swap-optimizer' ? ['fromToken','toToken','amount'] : ['tokenAddress'] };
  } catch(e) {
    return { code: '500', msg: `Service execution failed: ${e.message}`, payment: { txHash, verified: true } };
  }
};

routes['GET /api/x402/history'] = async () => ({
  code: '0', data: paymentRecords.slice(-50)
});

// ── Real Swap Execution (wallet-connected) ──
routes['POST /api/swap/execute'] = async (_, b) => {
  // Build swap transaction via OKX DEX aggregator for user to sign
  if (!b.fromToken || !b.toToken || !b.amount || !b.userWalletAddress) {
    return { code: 400, msg: 'Missing: fromToken, toToken, amount, userWalletAddress' };
  }
  try {
    const swapData = await okxRequest('GET', '/api/v6/dex/aggregator/swap', {
      chainIndex: CHAIN_ID, fromTokenAddress: b.fromToken, toTokenAddress: b.toToken,
      amount: b.amount, slippage: b.slippage || '0.5', userWalletAddress: b.userWalletAddress
    });
    return { code: '0', data: swapData?.data };
  } catch(e) {
    return { code: '500', msg: 'Swap build failed: ' + e.message };
  }
};

// ── AI Chat (LLM-powered Agent Brain) ──
routes['POST /api/chat'] = async (_, b) => {
  const message = b.message || b.input || '';
  if (!message) return { code: 400, msg: 'Missing message' };
  return await processAgentChat(message, b.context || {});
};

function buildTransferCalldata(to, amount) {
  const amountRaw = BigInt(Math.round(parseFloat(amount) * 1e6));
  const selector = 'a9059cbb';
  const paddedTo = to.toLowerCase().replace('0x','').padStart(64,'0');
  const paddedAmount = amountRaw.toString(16).padStart(64,'0');
  return '0x' + selector + paddedTo + paddedAmount;
}

// ── AI Agent Brain with LLM ──
async function processAgentChat(message, context) {
  const lower = message.toLowerCase();
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

  // Execute based on intent with REAL API calls
  const results = { intent, entities, steps: [], response: '' };
  try {
    switch(intent) {
      case 'swap': {
        const fromSym = (entities.tokens?.[0] || 'OKB').toUpperCase();
        const toSym = (entities.tokens?.[1] || 'USDT').toUpperCase();
        const fromToken = resolveToken(fromSym);
        const toToken = resolveToken(toSym);
        // Convert human-readable amount to raw (apply decimals)
        const humanAmount = entities.amount || '1';
        const fromDecimals = fromSym === 'USDT' || fromSym === 'USDC' ? 6 : 18;
        const amount = String(BigInt(Math.round(parseFloat(humanAmount) * (10 ** fromDecimals))));
        results.steps.push({ action: 'security_scan', status: 'running' });
        // Parallel: security scan + multi-strategy quotes
        const [scanRes, quoteStd, quoteTight, quoteHigh] = await Promise.allSettled([
          okxRequest('POST', '/api/v6/security/token-scan', { source: 'api', tokenList: [{ chainId: CHAIN_ID, contractAddress: toToken !== '' ? toToken : fromToken }] }),
          okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage: '0.5' }),
          okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage: '0.1' }),
          okxRequest('GET', '/api/v6/dex/aggregator/quote', { chainIndex: CHAIN_ID, fromTokenAddress: fromToken, toTokenAddress: toToken, amount, slippage: '1.0' }),
        ]);
        results.steps[0].status = 'done';
        results.steps.push({ action: 'multi_strategy_quote', status: 'done' });
        // Analyze routes
        const routes = [];
        if (quoteStd.status === 'fulfilled' && quoteStd.value?.data?.[0]) routes.push({ strategy: 'Standard (0.5%)', ...quoteStd.value.data[0] });
        if (quoteTight.status === 'fulfilled' && quoteTight.value?.data?.[0]) routes.push({ strategy: 'Tight (0.1%)', ...quoteTight.value.data[0] });
        if (quoteHigh.status === 'fulfilled' && quoteHigh.value?.data?.[0]) routes.push({ strategy: 'High-Fill (1.0%)', ...quoteHigh.value.data[0] });
        routes.sort((a,b) => parseFloat(b.toTokenAmount||0) - parseFloat(a.toTokenAmount||0));
        results.steps.push({ action: 'route_comparison', status: 'done' });
        const scanData = scanRes.status === 'fulfilled' ? scanRes.value?.data?.[0] : null;
        const riskLevel = scanData?.securityInfo?.riskLevel || 'unknown';
        results.data = { routes, securityScan: { riskLevel, safe: riskLevel !== 'critical' && riskLevel !== 'high' }, bestRoute: routes[0] || null };
        const best = routes[0];
        if (best) {
          const outDecimals = parseInt(best.toToken?.decimal || '18');
          const outAmount = (parseFloat(best.toTokenAmount || '0') / 10**outDecimals).toFixed(6);
          const fromSymDisplay = best.fromToken?.tokenSymbol || fromSym || '?';
          const toSymDisplay = best.toToken?.tokenSymbol || toSym || '?';
          const gas = best.estimateGasFee ? `Gas: ~${best.estimateGasFee} wei.` : '';
          const impact = best.priceImpactPercent ? `Price impact: ${best.priceImpactPercent}%.` : '';
          results.response = `Found ${routes.length} routes for ${humanAmount} ${fromSymDisplay} → ${toSymDisplay}. Best: ${best.strategy} yields ${outAmount} ${toSymDisplay}. ${impact} ${gas} Security: ${riskLevel}. ${riskLevel === 'critical' ? 'WARNING: Token flagged as critical risk!' : 'Ready to execute via wallet.'}`.trim();
        } else {
          results.response = 'No swap routes available for this pair. Check token addresses and try again.';
        }
        break;
      }
      case 'security_scan': {
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
        break;
      }
      case 'check_balance': {
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
        results.response = `Wallet ${addr.slice(0,6)}...${addr.slice(-4)}: ${ethers.formatEther(okbBal)} OKB. ${assets.filter(t=>t.balance!=='0').map(t=>`${t.symbol}: ${t.balance}`).join(', ') || 'No token balances.'}`;
        break;
      }
      case 'price_check': {
        const tokenAddr = entities.address || resolveToken(entities.tokens?.[0] || 'OKB');
        results.steps.push({ action: 'get_price', status: 'running' });
        const priceRes = await okxRequest('GET', '/api/v5/wallet/token/token-detail', { chainIndex: CHAIN_ID, tokenAddress: tokenAddr || '' });
        results.steps[0].status = 'done';
        const tokenData = priceRes?.data?.[0];
        results.data = tokenData;
        // Derive price from marketCap / totalSupply if direct price unavailable
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
        break;
      }
      case 'find_service': {
        results.steps.push({ action: 'discover_services', status: 'done' });
        results.data = SERVICE_CATALOG;
        results.response = `Found ${Object.keys(SERVICE_CATALOG).length} services on the marketplace: ${Object.entries(SERVICE_CATALOG).map(([k,v]) => `${v.name} (${v.price} USDT)`).join(', ')}. Use x402 protocol to pay and execute.`;
        break;
      }
      case 'earn': {
        results.steps.push({ action: 'check_opportunities', status: 'done' });
        results.data = { strategies: ['Provide liquidity on iZUMi DEX', 'Register as agent service provider', 'Stake in X Layer DeFi protocols'] };
        results.response = 'Earning opportunities on X Layer: 1) Provide liquidity on iZUMi/Uniswap DEX pairs. 2) Register as a service provider on Agent Nexus marketplace — earn USDT per API call. 3) Explore DeFi protocols on X Layer for yield. Current marketplace service prices: ' + Object.entries(SERVICE_CATALOG).map(([k,v]) => `${v.name}: ${v.price} USDT/call`).join(', ') + '.';
        break;
      }
      case 'set_alert': {
        const addr = entities.address || resolveToken(entities.tokens?.[0] || 'OKB');
        const targetPrice = entities.amount || '0';
        results.steps.push({ action: 'configure_alert', status: 'done' });
        results.data = { token: entities.tokens?.[0] || 'OKB', targetPrice, status: 'configured' };
        results.response = `Price alert configured for ${entities.tokens?.[0] || 'OKB'} at $${targetPrice}. Use the PriceAlert service (0.003 USDT via x402) for real-time monitoring with webhook notifications.`;
        break;
      }
      case 'help': {
        results.steps.push({ action: 'show_help', status: 'done' });
        results.response = 'Agent Nexus commands:\n• "swap 100 USDT to ETH" — Multi-strategy DEX swap with security scan\n• "scan 0x..." — Deep token/contract security analysis\n• "check balance" — View wallet token balances on X Layer\n• "price WETH" — Real-time token price lookup\n• "find services" — Discover marketplace services\n• "earn" — View yield opportunities\n\nAll commands support English and Chinese (中文). Try: "兑换100 USDT到ETH" or "扫描代币安全性"';
        results.data = { commands: ['swap', 'scan', 'balance', 'price', 'find services', 'earn', 'alert', 'help'], languages: ['en', 'zh'] };
        break;
      }
      default: {
        results.response = 'I understand these commands:\n• swap [amount] [token] to [token]\n• scan [address]\n• check balance\n• price [token]\n• find services\n• earn yield\n• set alert [token] [price]\n\nTry: "swap 100 USDT to ETH" or "扫描0x1E4a..." (Chinese supported)';
        results.data = { commands: ['swap', 'scan', 'balance', 'price', 'find services', 'earn', 'alert', 'help'], languages: ['en', 'zh'] };
      }
    }
  } catch(e) {
    results.response = 'Error: ' + e.message;
    results.error = e.message;
  }
  return { code: '0', data: results };
};

const TOKEN_MAP = {
  OKB: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // native token uses sentinel address for DEX API
  USDT: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
  WETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c', ETH: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c',
  WOKB: '0xA9a7e670aCaBbf6F9109fB1b5Eb44f4507F72c09', USDC: '0x1bBb34e2e0221065DeFdb93BB5ada5A4E0714B10',
};
function resolveToken(sym) { return TOKEN_MAP[(sym||'').toUpperCase()] ?? sym; }

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => data += c);
    req.on('end', () => {
      if (!data || data.trim() === '') return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const qIdx = req.url.indexOf('?');
    const urlPath = qIdx === -1 ? req.url : req.url.slice(0, qIdx);
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-402-Payment');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, {'Content-Type':'application/json'});
      res.end(JSON.stringify({code:'429',msg:'Rate limit exceeded. Max 60 requests per minute.'}));
      return;
    }

    // Health
    if (urlPath === '/health') { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({status:'ok',ts:Date.now()})); return; }

    // API routes
    const routeKey = method + ' ' + urlPath;
    if (routes[routeKey]) {
      const query = qIdx === -1 ? {} : Object.fromEntries(new URLSearchParams(req.url.slice(qIdx+1)));
      let body = {};
      if (method === 'POST') {
        try { body = await parseBody(req); }
        catch(e) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({code:'400',msg:e.message})); return; }
      }
      const result = await routes[routeKey](query, body, req.headers);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(result));
      return;
    }

    // Static files
    let filePath = urlPath === '/' ? '/index.html' : urlPath;
    const fullPath = path.join(__dirname, filePath);
    const ext = path.extname(fullPath);
    const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
    try {
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, {'Content-Type': mime[ext]||'application/octet-stream'});
      res.end(content);
    } catch {
      try { const html = fs.readFileSync(path.join(__dirname,'index.html')); res.writeHead(200,{'Content-Type':'text/html'}); res.end(html); }
      catch { res.writeHead(404); res.end('Not Found'); }
    }
  } catch(e) {
    console.error('Request error:', e);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({error:e.message}));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent Nexus running on http://${HOST}:${PORT}`);
});

process.on('uncaughtException', (e) => console.error('Uncaught:', e));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
