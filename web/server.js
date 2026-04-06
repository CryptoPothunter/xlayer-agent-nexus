/**
 * Agent Nexus — Dynamic Backend Server
 * Proxies OnchainOS API calls with HMAC-SHA256 signing (server-side)
 * Serves the interactive demo frontend
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8080');
const HOST = '0.0.0.0';

const API_KEY = process.env.OKX_API_KEY || '02543fec-afe0-4186-87cf-f137f112247d';
const SECRET_KEY = process.env.OKX_SECRET_KEY || 'E7B78265E16D0DFEA8C0410E4B0C5E84';
const PASSPHRASE = process.env.OKX_PASSPHRASE || 'Gf888888@';
const CHAIN_ID = '196';
const BASE_URL = 'https://web3.okx.com';

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
  return okxRequest('GET','/api/v5/wallet/post-transaction/transactions-by-address',{address:q.address,chainIndex:CHAIN_ID,limit:q.limit||'20'});
};

routes['GET /api/x402/services'] = async () => ({code:'0',data:[
  {name:'token-scanner',endpoint:'/services/token-scanner',price:'0.005',currency:'USDT',description:'Security scan for tokens'},
  {name:'swap-optimizer',endpoint:'/services/swap-optimizer',price:'0.01',currency:'USDT',description:'Multi-route swap optimization'},
  {name:'price-alert',endpoint:'/services/price-alert',price:'0.003',currency:'USDT',description:'Real-time price monitoring'},
]});
routes['POST /api/x402/quote'] = async (_,b) => ({code:'0',data:{
  service:b.service,price:({'token-scanner':'0.005','swap-optimizer':'0.01','price-alert':'0.003'})[b.service]||'0.01',
  currency:'USDT',quoteId:'quote_'+Date.now(),validFor:300,payTo:'0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5'}});
routes['POST /api/x402/execute'] = async (_,b,h) => {
  if (!h['x-402-payment']) return {code:'402',msg:'Payment Required',data:{'X-402-Price':'0.005','X-402-Currency':'USDT','X-402-Network':'eip155:196','X-402-PayTo':'0x48B62fFA1E2c68cCC4375955EFc97091393DB1d5'}};
  if (b.service==='token-scanner'&&b.params?.tokenAddress) {
    try { const r=await okxRequest('POST','/api/v6/security/token-scan',{source:'api',tokenList:[{chainId:CHAIN_ID,contractAddress:b.params.tokenAddress}]}); return {code:'0',msg:'Executed after x402 payment',data:r?.data}; } catch(e) { return {code:'0',msg:'Executed',data:{status:'completed'}}; }
  }
  return {code:'0',msg:'Service executed',data:{status:'completed'}};
};

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
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

    // Health
    if (urlPath === '/health') { res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({status:'ok',ts:Date.now()})); return; }

    // API routes
    const routeKey = method + ' ' + urlPath;
    if (routes[routeKey]) {
      const query = qIdx === -1 ? {} : Object.fromEntries(new URLSearchParams(req.url.slice(qIdx+1)));
      const body = method === 'POST' ? await parseBody(req) : {};
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
