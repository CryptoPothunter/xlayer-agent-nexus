/**
 * Agent Nexus — Production Backend Server (Entry Point)
 * Proxies OnchainOS API calls with HMAC-SHA256 signing (server-side)
 * Handles real swap execution, x402 payment flows, and AI chat
 * Serves the interactive frontend
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PORT, HOST, RATE_LIMIT, RATE_WINDOW } = require('./lib/config');

// ── Rate Limiting (per IP, 60 req/min) ──
const rateLimitMap = new Map();
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
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_WINDOW * 2) rateLimitMap.delete(ip);
  }
}, 300000);

// ── Route Table ──
const routes = {};

// Register all route modules
require('./routes/api')(routes);
require('./routes/x402')(routes);
require('./routes/demo')(routes);
require('./routes/contract')(routes);
require('./routes/autonomous')(routes);

// ── Body Parser ──
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

// ── HTTP Server ──
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
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: '429', msg: 'Rate limit exceeded. Max 60 requests per minute.' }));
      return;
    }

    // Health
    if (urlPath === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', ts: Date.now() })); return; }

    // API routes
    const routeKey = method + ' ' + urlPath;
    if (routes[routeKey]) {
      const query = qIdx === -1 ? {} : Object.fromEntries(new URLSearchParams(req.url.slice(qIdx + 1)));
      let body = {};
      if (method === 'POST') {
        try { body = await parseBody(req); }
        catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: '400', msg: e.message })); return; }
      }
      const result = await routes[routeKey](query, body, req.headers);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Static files
    let filePath = urlPath === '/' ? '/index.html' : urlPath;
    const fullPath = path.join(__dirname, filePath);
    const ext = path.extname(fullPath);
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    try {
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      try { const html = fs.readFileSync(path.join(__dirname, 'index.html')); res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); }
      catch { res.writeHead(404); res.end('Not Found'); }
    }
  } catch (e) {
    console.error('Request error:', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent Nexus running on http://${HOST}:${PORT}`);

  // Auto-start autonomous agent loop after 10 seconds
  setTimeout(() => {
    try {
      const autonomous = require('./lib/autonomous-loop');
      autonomous.start();
      console.log('[Server] Autonomous agent loop auto-started');
    } catch (e) {
      console.warn('[Server] Autonomous loop start failed:', e.message);
    }

    // Initialize multi-agent system
    try {
      const multiAgent = require('./lib/multi-agent');
      multiAgent.initialize().then(() => {
        console.log('[Server] Multi-agent system initialized');
      }).catch(e => {
        console.warn('[Server] Multi-agent init failed:', e.message);
      });
    } catch (e) {
      console.warn('[Server] Multi-agent init failed:', e.message);
    }
  }, 10000);
});

process.on('uncaughtException', (e) => console.error('Uncaught:', e));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
